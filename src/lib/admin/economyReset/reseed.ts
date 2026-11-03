/**
 * Reseed steps of the economy-only reset. Each step reuses the bootstrap's
 * own seeder so the rebuilt economy matches a fresh world of the same preset,
 * except that it runs on the kept states, budgets and clock.
 */
import type { Db } from "mongodb";
import type { State } from "@/lib/db/types";
import { upsertCountryOwnedCorpEntries } from "@/lib/admin/seed/upsertCountryOwnedCorps";
import {
  generateCountryOwnedSeedData,
  getInitialNationalBudgetsForPreset,
  type CountryOwnedSeedData,
} from "@/lib/seeds/reference/budgets";
import { isEasternBlocEra } from "@/lib/seeds/presetSelector";
import type { CountryId } from "@/lib/constants/countries";
import { countryCorporationSeeds, type CountryCorporationSeed } from "./rules/countryCorporations";

type Log = (message: string) => void;

/** Index fund and equity pool bootstraps, forced because their markers survive. */
export const ECONOMY_RESET_FUND_MIGRATIONS: readonly string[] = Object.freeze([
  "2026-06-01-index-fund-foundation",
  "2026-06-01-index-fund-seed",
  "2026-06-02-index-fund-real-bonds",
  "2026-09-03-equity-market-pools",
  "2026-08-01-backfill-unowned-headroom-units",
]);

/** Model and media-lane unique keys that must exist before seeders write markets. */
export const ECONOMY_RESET_INDEX_MIGRATIONS: readonly string[] = Object.freeze([
  "2026-10-04-media-discriminator-market-indexes",
  // The wipe drops the union collections (and their indexes), and seedIndexes
  // has no union module, so the union-specific migrations must rebuild these
  // guards before reseedUnions and the rebuilt labour economy write to them.
  "2026-07-04-union-leadership-indexes",
  "2026-09-29-union-prosecution-bar-index",
]);

/** Post-breakup names for continuing states whose issuer the preset names after the federation. */
const SUCCESSOR_ISSUER_NAMES: Readonly<Record<string, { name: string; description: string }>> = {
  RU: {
    name: "Russian Federation",
    description:
      "Russian sovereign issuer after the Soviet breakup; no command-economy production assets.",
  },
};

/** Source entities of the federation settlements applied in this world. */
export async function loadDissolvedFederations(db: Db, preset: string): Promise<string[]> {
  const rows = await db
    .collection<{ _id: string; sourceEntityId: string; presetId: string; status: string }>(
      "federationSettlementApplications"
    )
    .find({ presetId: preset, status: "applied" }, { projection: { sourceEntityId: 1 } })
    .toArray();
  return [...new Set(rows.map((row) => row.sourceEntityId))];
}

function entriesFor(
  seed: CountryCorporationSeed,
  states: { id: string; population: number; gdp: number; countryId: string }[],
  preset: string,
  commandEconomyEnabled: boolean,
  log: Log,
  liveCurrency?: string
): CountryOwnedSeedData[] {
  const generated = generateCountryOwnedSeedData(
    states,
    preset,
    seed.commandAware ? commandEconomyEnabled : false,
    log
  ).filter((entry) => entry.corporation.countryOwnerId === seed.countryId);
  if (seed.mode === "generator") return generated;
  if (seed.mode === "successorIssuer") {
    const issuer = generated.find((entry) => entry.corporation.isPrimaryNationalCorporation);
    if (!issuer) return [];
    const renamed = SUCCESSOR_ISSUER_NAMES[seed.countryId];
    return [
      {
        corporation: {
          ...issuer.corporation,
          ...(renamed ?? {}),
          // The kept budget's currency, so the issuer matches the live forex layer.
          ...(liveCurrency ? { liquidCurrencyCode: liveCurrency as never } : {}),
        },
        sectors: [],
      },
    ];
  }
  // Same override seedModernBudgets2019 writes.
  const issuer = generated.find((entry) => entry.corporation.isPrimaryNationalCorporation);
  if (!issuer) throw new Error("Missing 2019 RU sovereign issuer template");
  return [
    {
      corporation: {
        ...issuer.corporation,
        name: "Russian Federation",
        description: "2019 Russian sovereign issuer; no Soviet command-economy production assets.",
        liquidCurrencyCode: "RUB",
      },
      sectors: [],
    },
  ];
}

/**
 * Rebuild every country-owned corporation and SOE from the generators, one
 * country at a time, using the live regions. Never calls the budget seeders,
 * which would overwrite the kept budgets and enacted laws.
 */
export async function reseedCountryOwnedCorporations(
  db: Db,
  preset: string,
  commandEconomyEnabled: boolean,
  log: Log
): Promise<{ countries: number; corporations: number; sectors: number }> {
  const states = await db
    .collection<State>("states")
    .find({}, { projection: { _id: 1, countryId: 1, population: 1, gdp: 1 } })
    .toArray();
  const byCountry = new Map<
    string,
    { id: string; population: number; gdp: number; countryId: string }[]
  >();
  for (const state of states) {
    const rows = byCountry.get(state.countryId) ?? [];
    rows.push({
      id: String(state._id),
      population: state.population,
      gdp: state.gdp,
      countryId: state.countryId,
    });
    byCountry.set(state.countryId, rows);
  }
  const dissolvedFederations = await loadDissolvedFederations(db, preset);
  const seeds = countryCorporationSeeds({
    preset,
    nationalBudgetCountries: getInitialNationalBudgetsForPreset(preset).map(
      (budget) => budget.countryId
    ),
    easternBlocEra: isEasternBlocEra(preset),
    dissolvedFederations,
  });
  const liveCurrencies = new Map(
    (
      await db
        .collection<{ countryId: string; currencyCode?: string }>("federalBudget")
        .find(
          { countryId: { $in: dissolvedFederations } },
          { projection: { countryId: 1, currencyCode: 1 } }
        )
        .toArray()
    ).map((row) => [row.countryId, row.currencyCode])
  );
  const totals = { countries: 0, corporations: 0, sectors: 0 };
  for (const seed of seeds) {
    const entries = entriesFor(
      seed,
      byCountry.get(seed.countryId) ?? [],
      preset,
      commandEconomyEnabled,
      log,
      liveCurrencies.get(seed.countryId)
    );
    if (entries.length === 0) continue;
    // One bounded write set per country; the helper also re-points sectors left
    // on stale country-owned ids, which a fresh wipe never has.
    const result = await upsertCountryOwnedCorpEntries(db, seed.countryId as CountryId, entries);
    totals.countries += 1;
    totals.corporations += result.corporations;
    totals.sectors += result.sectors;
  }
  log(
    `Economy reset: ${totals.corporations} country-owned corporations with ${totals.sectors} sectors across ${totals.countries} countries`
  );
  return totals;
}
