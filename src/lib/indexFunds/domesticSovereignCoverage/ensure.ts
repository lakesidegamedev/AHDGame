import type { CountryId } from "@/lib/constants/countries";
import { withSessionDb } from "@/lib/db/sessionDb";
/**
 * Gated domestic sovereign-bond coverage shell.
 *
 * When gameConfig.domesticSovereignBondCoverageEnabled is exactly true,
 * ensures one home-sovereign bond fund per uncovered sovereign issuer (see
 * ./rules for the plan). The funds themselves are seeded with the standing
 * fund-creation economics (initial NAV, reserve units, seed cash); every
 * bond they ever hold is bought afterwards by the existing fund-cron deploy
 * pass through purchaseBondUnitsForFund, which debits real fund cash at
 * market quotes under the holder cap. This step mints no per-purchase cash,
 * guarantees no subscription, touches no other fund, and changes nothing
 * when the flag is absent or false (it returns before any read or write).
 */

import { ObjectId, type Db } from "mongodb";
import type { GameConfig, IndexFund } from "@/lib/db/types";
import { getRegisteredCountryIds } from "@/lib/country/registeredCountries";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import { resolveFundBondCountryId } from "@/lib/indexFunds/fundBondReserve";
import {
  INDEX_FUND_INITIAL_NAV,
  INDEX_FUND_SEED_CASH_ANCHOR,
  INDEX_FUND_SEED_RESERVE_UNITS,
} from "@/lib/indexFunds/unitAccounting";
import {
  buildDomesticSovereignBondFundSeed,
  planDomesticSovereignCoverage,
} from "@/lib/indexFunds/domesticSovereignCoverage/rules";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { bondsCollection } from "@/lib/db/repositories/bonds";
import { indexFundsCollection } from "@/lib/db/repositories/indexFunds";
import { indexFundPositionsCollection } from "@/lib/db/repositories/indexFundPositions";

export interface EnsureDomesticCoverageResult {
  /** Sorted country ids ensured this pass (inserted now, not merely planned). */
  ensured: string[];
}

export async function ensureDomesticSovereignBondFunds(
  db: Db,
  options: { enabled: boolean }
): Promise<EnsureDomesticCoverageResult> {
  if (options.enabled !== true) return { ensured: [] };

  return withSessionDb(db, (db) => ensureDomesticSovereignBondFundsWork(db));
}

async function ensureDomesticSovereignBondFundsWork(db: Db): Promise<EnsureDomesticCoverageResult> {
  const registered = await getRegisteredCountryIds(db);
  const budgets = await federalBudgetCollection<{ _id: string }>(db)
    .find(
      { _id: { $in: registered.map((countryId) => getNationalBudgetId(countryId)) } },
      { projection: { _id: 1 } }
    )
    .toArray();
  const budgetedCountryIds = budgets.map((doc) => (doc._id === "federal" ? "US" : String(doc._id)));
  const liveIssuerCountryIds = (
    await bondsCollection(db).distinct("countryId", {
      issuerType: "sovereign",
      matured: false,
      defaulted: { $ne: true },
    })
  ).flatMap((value) => (typeof value === "string" && value.length > 0 ? [value] : []));
  const serviceableFunds = await indexFundsCollection(db)
    .find(
      { $or: [{ status: "active" }, { status: "paused", pauseReason: "backing_ratio" }] },
      { projection: { countryId: 1, anchorCurrencyCode: 1, scope: 1, reserveUnits: 1 } }
    )
    .toArray();
  const repairTime = new Date();
  const reserveRepairs = serviceableFunds
    .filter((fund) => Number.isFinite(fund.reserveUnits) && fund.reserveUnits >= 0)
    .map((fund) => ({
      updateOne: {
        filter: { fundId: fund._id, holderKind: "fund_reserve" as const },
        update: {
          $setOnInsert: {
            fundId: fund._id,
            holderKind: "fund_reserve" as const,
            units: fund.reserveUnits,
            avgNavAnchor: INDEX_FUND_INITIAL_NAV,
            createdAt: repairTime,
            updatedAt: repairTime,
          },
        },
        upsert: true,
      },
    }));
  if (reserveRepairs.length) await indexFundPositionsCollection(db).bulkWrite(reserveRepairs);
  const coveredHomeCountryIds = serviceableFunds
    .map((fund) => resolveFundBondCountryId(fund))
    .filter((value): value is NonNullable<typeof value> => value !== undefined);

  const planned = planDomesticSovereignCoverage({
    enabled: true,
    registeredCountryIds: registered,
    budgetedCountryIds,
    liveSovereignIssuerCountryIds: liveIssuerCountryIds,
    coveredHomeCountryIds,
    anchorCurrencyByCountryId: COUNTRY_CURRENCY_MAP as unknown as Record<string, string>,
  });
  if (planned.length === 0) return { ensured: [] };

  // Insert-missing by slug: a fund seeded by the bond-fund migration (or a
  // previous pass) is left alone, never rewritten.
  const seeds = planned.map((countryId) =>
    buildDomesticSovereignBondFundSeed(
      countryId,
      COUNTRY_CURRENCY_MAP[countryId as keyof typeof COUNTRY_CURRENCY_MAP] as string
    )
  );
  const existingSlugs = new Set(
    (
      await indexFundsCollection(db)
        .find({ slug: { $in: seeds.map((seed) => seed.slug) } }, { projection: { slug: 1 } })
        .toArray()
    ).map((fund) => fund.slug)
  );
  const missing = seeds.filter((seed) => !existingSlugs.has(seed.slug));
  if (missing.length === 0) return { ensured: [] };

  const now = new Date();
  const documents: IndexFund[] = missing.map((seed) => ({
    _id: new ObjectId(),
    slug: seed.slug,
    name: seed.name,
    tickerSymbol: seed.ticker,
    scope: seed.scope,
    kind: seed.kind,
    countryId: seed.countryId as CountryId,
    anchorCurrencyCode: COUNTRY_CURRENCY_MAP[seed.countryId as CountryId],
    status: "active",
    quotedNav: INDEX_FUND_INITIAL_NAV,
    unitSupply: INDEX_FUND_SEED_RESERVE_UNITS,
    reserveUnits: INDEX_FUND_SEED_RESERVE_UNITS,
    cashAnchor: INDEX_FUND_SEED_CASH_ANCHOR,
    targetConstituents: [],
    holdings: [],
    createdAt: now,
    updatedAt: now,
  }));
  await indexFundsCollection(db).insertMany(documents);
  await indexFundPositionsCollection(db).bulkWrite(
    documents.map((fund) => ({
      updateOne: {
        filter: { fundId: fund._id, holderKind: "fund_reserve" as const },
        update: {
          $setOnInsert: { fundId: fund._id, holderKind: "fund_reserve" as const, createdAt: now },
          $set: {
            units: INDEX_FUND_SEED_RESERVE_UNITS,
            avgNavAnchor: INDEX_FUND_INITIAL_NAV,
            updatedAt: now,
          },
        },
        upsert: true,
      },
    }))
  );
  const ensured = missing.map((seed) => seed.countryId);
  return { ensured: ensured.sort() };
}

/** Projected gameConfig read for the gate; null/undefined counts as off. */
export function domesticCoverageEnabled(
  config: Pick<GameConfig, "domesticSovereignBondCoverageEnabled"> | null | undefined
): boolean {
  return config?.domesticSovereignBondCoverageEnabled === true;
}
