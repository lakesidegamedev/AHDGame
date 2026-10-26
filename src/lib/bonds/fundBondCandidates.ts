/**
 * One bond read for a whole reserve-deployment pass.
 *
 * `deployBondReserveFromCash` is called once per fund, and each call used to
 * read the issues it can buy, the sovereign rating table and the exchange-rate
 * gate for itself. On a world with dozens of funds that is dozens of scans of
 * the same collection in one turn. This module loads the union of every fund's
 * candidate query once and answers each fund from memory, applying the filters,
 * ranking and sort the per-fund query applied.
 *
 * Funds compete for the same public float, and that ordering is part of the
 * economic result, so the in-memory view has to follow each settled purchase:
 * `applyPurchase` moves the units out of `publicFloat` and into the fund's
 * holder row, exactly as the settlement write did. A later fund therefore sees
 * the same issue list a fresh read would have returned.
 */
import { ObjectId, type Db } from "mongodb";
import type { Bond, IndexFund } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import { CREDIT_RATINGS, type CreditRating } from "@/lib/db/types/centralBank";
import type { BondFundUniverse } from "@/lib/indexFunds/fundDefinitions";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";

export const MAX_GLOBAL_SOVEREIGN_ISSUES_PER_PASS = 48;

export function resolveFundBondCountryId(
  fund: Pick<IndexFund, "countryId" | "anchorCurrencyCode" | "scope">
): CountryId {
  if (fund.countryId) return fund.countryId;

  const byCurrency = Object.entries(COUNTRY_CURRENCY_MAP).find(
    ([, currency]) => currency === fund.anchorCurrencyCode
  );
  if (byCurrency) return byCurrency[0] as CountryId;

  return "US";
}

function bondCurrencyCode(bond: Pick<Bond, "currencyCode" | "countryId">): string {
  return (
    bond.currencyCode ??
    (bond.countryId ? COUNTRY_CURRENCY_MAP[bond.countryId] : undefined) ??
    "USD"
  );
}

export function isGlobalFundBondEligible(
  bond: Pick<Bond, "currencyCode" | "countryId">,
  homeCountryId: CountryId,
  tradableCurrencies: ReadonlySet<string>,
  controlledCurrencies: ReadonlySet<string>
): boolean {
  if (bond.countryId === homeCountryId) return true;
  const currencyCode = bondCurrencyCode(bond);
  return tradableCurrencies.has(currencyCode) && !controlledCurrencies.has(currencyCode);
}

export function rankSovereignIssuesForBreadth(bonds: Bond[]): Bond[] {
  const isHeld = (bond: Bond) => bond.holders.some((holder) => holder.units > 0);
  const byMaturityThenId = (a: Bond, b: Bond) =>
    a.maturityTurn - b.maturityTurn || a._id.toString().localeCompare(b._id.toString());
  const ranked: Bond[] = [];
  // Unheld issues first; within each held tier, interleave issuers
  // round-robin so a capped slice spreads across countries instead of
  // being filled by whichever countryId sorts first.
  for (const heldTier of [false, true]) {
    const byCountry = new Map<string, Bond[]>();
    for (const bond of bonds) {
      if (isHeld(bond) !== heldTier) continue;
      const key = String(bond.countryId ?? "");
      const group = byCountry.get(key);
      if (group) group.push(bond);
      else byCountry.set(key, [bond]);
    }
    const groups = [...byCountry.keys()]
      .sort((a, b) => a.localeCompare(b))
      .map((key) => [...byCountry.get(key)!].sort(byMaturityThenId));
    const roundCount = groups.reduce((max, group) => Math.max(max, group.length), 0);
    for (let round = 0; round < roundCount; round++) {
      for (const group of groups) {
        if (round < group.length) ranked.push(group[round]!);
      }
    }
  }
  return ranked;
}

function ratingIndex(rating: string | undefined, fallback: CreditRating = "BBB"): number {
  const idx = CREDIT_RATINGS.indexOf((rating ?? fallback) as CreditRating);
  return idx >= 0 ? idx : CREDIT_RATINGS.indexOf(fallback);
}

/** Inclusive rating bounds: `minRating` is the worst grade allowed, `maxRating` the best. */
export function ratingWithinUniverse(
  rating: string | undefined,
  universe: Pick<BondFundUniverse, "minRating" | "maxRating">
): boolean {
  const idx = ratingIndex(rating);
  if (universe.minRating && idx > CREDIT_RATINGS.indexOf(universe.minRating)) return false;
  if (universe.maxRating && idx < CREDIT_RATINGS.indexOf(universe.maxRating)) return false;
  return true;
}

/** The mandate inputs one fund needs, so the cache never touches a fund document. */
export type BondCandidateSelector = {
  fund: Pick<IndexFund, "countryId" | "anchorCurrencyCode" | "scope">;
  universe?: BondFundUniverse;
  /** Global reserve demand widens the query past the home country. */
  globalDemandEnabled: boolean;
};

export interface FundBondCandidateCache {
  /** Every live issue with float, in collection order, carrying live float. */
  bonds: Bond[];
  byId: Map<string, Bond>;
  /** Sovereign rating by national-budget id, read once for every issuer. */
  ratingByBudgetId: Map<string, string | undefined>;
  /** Corporate rating snapshot by issuer id, read once for every corp issue. */
  ratingByCorporationId: Map<string, string | undefined>;
  tradableCurrencies: ReadonlySet<string>;
  controlledCurrencies: ReadonlySet<string>;
}

/** One source shared by every fund in the pass; the second load is free. */
export interface FundBondCandidateSource {
  load(): Promise<FundBondCandidateCache>;
  /** Mirror a settled purchase so later funds plan against the same float. */
  applyPurchase(bond: Bond, fundId: ObjectId, units: number, avgCostPerUnit: number): void;
}

export async function loadFundBondCandidateCache(db: Db): Promise<FundBondCandidateCache> {
  const bonds = await db
    .collection<Bond>("bonds")
    .find({ matured: false, defaulted: { $ne: true }, publicFloat: { $gt: 0 } })
    .toArray();

  const sovereignCountryIds = [
    ...new Set(bonds.flatMap((bond) => (bond.countryId ? [bond.countryId] : []))),
  ];
  const corporationIds = [
    ...new Set(bonds.flatMap((bond) => (bond.corporationId ? [bond.corporationId] : []))),
  ];
  const [budgets, corporations, currencyRows] = await Promise.all([
    sovereignCountryIds.length > 0
      ? db
          .collection<{ _id: string; creditRating?: string }>("federalBudget")
          .find(
            { _id: { $in: sovereignCountryIds.map((id) => getNationalBudgetId(id)) } },
            { projection: { creditRating: 1 } }
          )
          .toArray()
      : Promise.resolve([] as Array<{ _id: string; creditRating?: string }>),
    corporationIds.length > 0
      ? db
          .collection<{ _id: ObjectId; creditRatingSnapshot?: string }>("corporations")
          .find({ _id: { $in: corporationIds } }, { projection: { creditRatingSnapshot: 1 } })
          .toArray()
      : Promise.resolve([] as Array<{ _id: ObjectId; creditRatingSnapshot?: string }>),
    db
      .collection<{ currencyCode?: string; rate?: number; capitalControls?: boolean }>(
        "exchangeRates"
      )
      .find({})
      .project({ currencyCode: 1, rate: 1, capitalControls: 1 })
      .toArray(),
  ]);

  return {
    bonds,
    byId: new Map(bonds.map((bond) => [bond._id.toString(), bond])),
    ratingByBudgetId: new Map(budgets.map((budget) => [String(budget._id), budget.creditRating])),
    ratingByCorporationId: new Map(
      corporations.map((corp) => [corp._id.toString(), corp.creditRatingSnapshot])
    ),
    tradableCurrencies: new Set(
      currencyRows.flatMap((row) =>
        row.currencyCode && typeof row.rate === "number" && row.rate > 0 ? [row.currencyCode] : []
      )
    ),
    controlledCurrencies: new Set(
      currencyRows.flatMap((row) =>
        row.currencyCode && row.capitalControls === true ? [row.currencyCode] : []
      )
    ),
  };
}

/** The issues one fund may buy this pass, in the exact order its own query returned. */
export function fundBondCandidates(
  cache: FundBondCandidateCache,
  selector: BondCandidateSelector
): Bond[] {
  const homeCountryId = resolveFundBondCountryId(selector.fund);
  const live = (bond: Bond) => (bond.publicFloat ?? 0) > 0;

  if (selector.universe) {
    const universe = selector.universe;
    let eligible = cache.bonds.filter((bond) => {
      if (!live(bond)) return false;
      const isSovereign = bond.issuerType === "sovereign";
      if (universe.issuerType === "sovereign" ? !isSovereign : isSovereign) return false;
      if (universe.homeOnly && bond.countryId !== homeCountryId) return false;
      return true;
    });
    if (universe.minRating || universe.maxRating) {
      const ratingOf = (bond: Bond): string | undefined =>
        universe.issuerType === "sovereign"
          ? bond.countryId
            ? cache.ratingByBudgetId.get(getNationalBudgetId(bond.countryId))
            : undefined
          : cache.ratingByCorporationId.get(bond.corporationId?.toString() ?? "");
      eligible = eligible.filter((bond) => ratingWithinUniverse(ratingOf(bond), universe));
    }
    if (universe.homeOnly) return rankSovereignIssuesForBreadth(eligible);
    return rankSovereignIssuesForBreadth(
      eligible.filter((bond) =>
        isGlobalFundBondEligible(
          bond,
          homeCountryId,
          cache.tradableCurrencies,
          cache.controlledCurrencies
        )
      )
    ).slice(0, MAX_GLOBAL_SOVEREIGN_ISSUES_PER_PASS);
  }

  const bonds = cache.bonds.filter(
    (bond) =>
      bond.issuerType === "sovereign" &&
      live(bond) &&
      (selector.globalDemandEnabled || bond.countryId === homeCountryId)
  );
  // Same key as the per-fund query: soonest maturity first, deepest float
  // among equal maturities. Array.sort is stable, so ties keep collection
  // order, which is what a single-collection sort returned.
  bonds.sort(
    (a, b) => a.maturityTurn - b.maturityTurn || (b.publicFloat ?? 0) - (a.publicFloat ?? 0)
  );
  if (!selector.globalDemandEnabled) return bonds;
  return rankSovereignIssuesForBreadth(
    bonds.filter((bond) =>
      isGlobalFundBondEligible(
        bond,
        homeCountryId,
        cache.tradableCurrencies,
        cache.controlledCurrencies
      )
    )
  ).slice(0, MAX_GLOBAL_SOVEREIGN_ISSUES_PER_PASS);
}

/** The pass-shared source. Loads on first use and remembers the settled buys. */
export function lazyFundBondCandidates(db: Db): FundBondCandidateSource {
  let pending: Promise<FundBondCandidateCache> | undefined;
  let loaded: FundBondCandidateCache | undefined;
  return {
    async load() {
      if (loaded) return loaded;
      pending ??= loadFundBondCandidateCache(db).then((cache) => (loaded = cache));
      return pending;
    },
    applyPurchase(bond, fundId, units, avgCostPerUnit) {
      const target = loaded?.byId.get(bond._id.toString()) ?? bond;
      target.publicFloat = Math.max(0, (target.publicFloat ?? 0) - units);
      const holders = (target.holders ??= []);
      const existing = holders.find((holder) => holder.fundId?.equals(fundId));
      if (existing) {
        existing.units += units;
        existing.avgCostPerUnit = avgCostPerUnit;
      } else {
        holders.push({ fundId, units, avgCostPerUnit });
      }
    },
  };
}
