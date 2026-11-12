/** Opportunity-weighted NPP surplus investing used by the newer behaviour model. */
import type { NPP, Bond } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import {
  type CurrencyCode,
  getSeedCurrencyCode,
  COUNTRY_CURRENCY_MAP,
} from "@/lib/constants/currencies";
import type { Db, ObjectId } from "mongodb";
import { careerArchetypeModifiersContinuous } from "@/lib/nppAutonomy/v3/careerArchetype";
import {
  volumeNormalizedMultipliers,
  OPPORTUNITY_BUY_CAP,
  bondBuyOpportunity,
  stockBuyOpportunity,
} from "@/lib/nppAutonomy/v6/rules/opportunityInvesting";
import { makeSeededRng } from "@/lib/events/substrate/rng";
import { loadFxRatesByCurrency } from "@/lib/currency/corporationCapital";
import { nppBuyBond } from "@/lib/nppAutonomy/v3/finance/nppBonds";
import { loadEquityPoolsByCurrency, equityPoolCurrency } from "@/lib/equities/marketPool";
import { boundedParallelMap } from "@/lib/indexFunds/boundedParallelMap";
import { nppBuyShares } from "@/lib/nppAutonomy/v3/finance/nppShares";
import { countryScopeFilter, NPP_ACTION_RNG_SALT, groupInOrder } from "./nppActionShared";
import {
  NPP_BOND_INVEST_RESERVE_FLOOR,
  NPP_BOND_INVEST_BASE_PROBABILITY,
  bondCandidates,
  NPP_BOND_MIN_YIELD_PCT,
  pickIndexByWeight,
  bondBuyUnits,
  NPP_STOCK_INVEST_RESERVE_FLOOR,
  NPP_STOCK_INVEST_BASE_PROBABILITY,
  type StockCandidateCorp,
  stockCandidates,
  stockMinValueRatio,
  pickStockCandidate,
  stockBuyShares,
} from "./nppInvestCandidates";
import { getNppsCollection } from "@/lib/db/collections/npps";
import { getCorporationsCollection } from "@/lib/db/collections/corporations";
import { bondsCollection } from "@/lib/db/repositories/bonds";

/** An NPP weighing a market buy this sweep, with its v6 chance. */
export type InvestDecider = {
  npp: Pick<NPP, "_id" | "countryId" | "personality" | "nppInvestmentCashAnchor">;
  countryId: CountryId;
  homeCurrency: CurrencyCode;
  cashAnchor: number;
  riskToleranceMult: number;
  saveInvestAppetiteMult: number;
  /** Engine 5 chance to act: the base probability times risk tolerance. */
  baseProbability: number;
  /** v6 opportunity multiplier on `baseProbability`. */
  multiplier: number;
};

/** Acting NPPs above the investment floor, in a stable `_id` order. */
export async function loadInvestDeciders(
  db: Db,
  floor: number,
  baseProbability: number,
  countryScope: CountryId[] | null,
  preset: string | undefined,
  actsThisTurn: ((id: ObjectId) => boolean) | undefined
): Promise<InvestDecider[]> {
  const npps = await (
    await getNppsCollection(db)
  )
    .find(
      {
        retiredAt: null,
        nppInvestmentCashAnchor: { $gt: floor },
        ...countryScopeFilter(countryScope),
      },
      { projection: { countryId: 1, personality: 1, nppInvestmentCashAnchor: 1 } }
    )
    .sort({ _id: 1 })
    .toArray();
  const deciders: InvestDecider[] = [];
  for (const npp of npps) {
    if (actsThisTurn && !actsThisTurn(npp._id)) continue;
    const cashAnchor = npp.nppInvestmentCashAnchor ?? 0;
    if (cashAnchor <= floor) continue;
    const countryId = (npp.countryId ?? "US") as CountryId;
    const homeCurrency = (
      preset ? getSeedCurrencyCode(countryId, preset) : (COUNTRY_CURRENCY_MAP[countryId] ?? "USD")
    ) as CurrencyCode;
    const { riskToleranceMult, saveInvestAppetiteMult } = careerArchetypeModifiersContinuous(
      npp.personality
    );
    deciders.push({
      npp,
      countryId,
      homeCurrency,
      cashAnchor,
      riskToleranceMult,
      saveInvestAppetiteMult,
      baseProbability: baseProbability * riskToleranceMult,
      multiplier: 1,
    });
  }
  return deciders;
}

/**
 * Score every decider, keep those with something worth buying, and set each
 * one's volume-normalized opportunity multiplier. The expected purchase count
 * over the kept deciders equals the engine 5 expectation on the same set,
 * sum(base x risk); see v6/rules/opportunityInvesting.ts.
 */
export function applyOpportunityMultipliers(
  deciders: InvestDecider[],
  score: (decider: InvestDecider) => number
): InvestDecider[] {
  const scored = deciders
    .map((decider) => ({ decider, score: score(decider) }))
    .filter((entry) => entry.score > 0);
  const base = scored.map((entry) => entry.decider.baseProbability);
  const multipliers = volumeNormalizedMultipliers(
    scored.map((entry) => entry.score),
    base,
    base.reduce((sum, p) => sum + p, 0),
    OPPORTUNITY_BUY_CAP
  );
  return scored.map((entry, i) => ({ ...entry.decider, multiplier: multipliers[i] }));
}

/**
 * v6 bond-investment sweep (NPP engine 6). Same candidates, sampling and
 * sizing as the engine 5 sweep above, but each NPP looks at the market before
 * deciding: its chance scales with the best current yield on offer against
 * the yield floor, normalized so the expected number of purchases is
 * unchanged. Bonds are read once for every country in the sweep.
 */
export async function investNppBondSurplusV6(
  db: Db,
  currentTurn: number,
  countryScope: CountryId[] | null,
  preset: string | undefined,
  actsThisTurn: ((id: ObjectId) => boolean) | undefined
): Promise<void> {
  const deciders = await loadInvestDeciders(
    db,
    NPP_BOND_INVEST_RESERVE_FLOOR,
    NPP_BOND_INVEST_BASE_PROBABILITY,
    countryScope,
    preset,
    actsThisTurn
  );
  if (deciders.length === 0) return;

  const countries = [...new Set(deciders.map((d) => d.countryId))];
  const bonds = await bondsCollection(db)
    .find(
      {
        countryId: { $in: countries },
        maturityTurn: { $gt: currentTurn },
        publicFloat: { $gt: 0 },
      },
      {
        projection: {
          currencyCode: 1,
          countryId: 1,
          publicFloat: 1,
          marketPrice: 1,
          couponRate: 1,
          maturityTurn: 1,
          issuerType: 1,
          defaulted: 1,
          issuerName: 1,
        },
      }
    )
    .sort({ couponRate: -1 })
    .toArray();
  const bondsByCountry = new Map<CountryId, Bond[]>(countries.map((c) => [c, []]));
  for (const bond of bonds) bondsByCountry.get(bond.countryId as CountryId)?.push(bond);

  const acting = applyOpportunityMultipliers(deciders, (d) => {
    const best = bondCandidates(bondsByCountry.get(d.countryId)!, d.countryId, d.homeCurrency)[0];
    return best && best.yield >= NPP_BOND_MIN_YIELD_PCT
      ? bondBuyOpportunity(best.yield, NPP_BOND_MIN_YIELD_PCT)
      : 0;
  });
  if (acting.length === 0) return;

  const rng = makeSeededRng(`npp-bond-invest:${currentTurn}${NPP_ACTION_RNG_SALT}`);
  const fxByCcy = await loadFxRatesByCurrency(db);
  for (const d of acting) {
    if (rng() >= d.baseProbability * d.multiplier) continue;
    // Live candidates: an earlier buy this sweep may have thinned a float.
    const scoredBonds = bondCandidates(
      bondsByCountry.get(d.countryId)!,
      d.countryId,
      d.homeCurrency
    );
    if (scoredBonds.length === 0 || scoredBonds[0].yield < NPP_BOND_MIN_YIELD_PCT) continue;
    const bond =
      scoredBonds[
        pickIndexByWeight(
          scoredBonds.map((s) => Math.pow(s.yield, d.riskToleranceMult)),
          rng()
        )
      ].bond;
    const homeRate = fxByCcy.get(d.homeCurrency) ?? 1;
    const units = bondBuyUnits(d.cashAnchor, d.saveInvestAppetiteMult, homeRate, bond);
    if (units < 1) continue;
    const result = await nppBuyBond(
      db,
      d.npp,
      bond._id,
      units,
      currentTurn,
      homeRate,
      bond,
      preset
    );
    if (result.ok) bond.publicFloat -= units;
  }
}

/**
 * v6 stock-investment sweep (NPP engine 6). Same candidates, sampling and
 * sizing as the engine 5 sweep, with two changes. Decision: each NPP looks at its market before deciding. Its chance scales
 * with the best value ratio on offer against its own value floor, normalized
 * so the expected number of purchases is unchanged; see
 * v6/rules/opportunityInvesting.ts.
 *
 * Cost: the sweep is split by home currency, so partitions share no document
 * and run concurrently. Each draws from its own seeded stream in `_id` order,
 * so the outcome does not depend on how many run at once. Equity pools are
 * read once per sweep; settlement keeps each snapshot's cash in step.
 */
export async function investNppStockSurplusV6(
  db: Db,
  currentTurn: number,
  countryScope: CountryId[] | null,
  preset: string | undefined,
  actsThisTurn: ((id: ObjectId) => boolean) | undefined,
  partitionConcurrency: number
): Promise<void> {
  const deciders = await loadInvestDeciders(
    db,
    NPP_STOCK_INVEST_RESERVE_FLOOR,
    NPP_STOCK_INVEST_BASE_PROBABILITY,
    countryScope,
    preset,
    actsThisTurn
  );
  if (deciders.length === 0) return;

  const countries = [...new Set(deciders.map((d) => d.countryId))];
  const corps = await (
    await getCorporationsCollection(db)
  )
    .find(
      {
        countryId: { $in: countries },
        isPrivate: { $ne: true },
        hiddenFromExchange: { $ne: true },
        isNationalized: { $ne: true },
        countryOwnerId: { $exists: false },
        sharePrice: { $gt: 0 },
        totalShares: { $gt: 0 },
        publicFloat: { $gt: 0 },
      },
      {
        projection: {
          liquidCurrencyCode: 1,
          countryId: 1,
          isPrivate: 1,
          isNationalized: 1,
          countryOwnerId: 1,
          sharePrice: 1,
          fundamentalSharePrice: 1,
          totalShares: 1,
          publicFloat: 1,
          shareBuybackMode: 1,
        },
      }
    )
    .sort({ _id: 1 })
    .toArray();
  corps.sort((a, b) => b.sharePrice * b.totalShares - a.sharePrice * a.totalShares);
  const corpsByCountry = new Map<CountryId, StockCandidateCorp[]>(countries.map((c) => [c, []]));
  for (const corp of corps) corpsByCountry.get(corp.countryId as CountryId)?.push(corp);

  const acting = applyOpportunityMultipliers(deciders, (d) => {
    const candidates = stockCandidates(
      corpsByCountry.get(d.countryId)!,
      d.homeCurrency,
      d.riskToleranceMult
    );
    if (candidates.length === 0) return 0;
    const best = Math.max(...candidates.map((c) => c.valueRatio));
    return stockBuyOpportunity(best, stockMinValueRatio(d.riskToleranceMult));
  });
  if (acting.length === 0) return;

  const [fxByCcy, pools] = await Promise.all([
    loadFxRatesByCurrency(db),
    loadEquityPoolsByCurrency(db),
  ]);
  const partitions = groupInOrder(acting, (d) => d.homeCurrency);
  // A corp without a liquid currency settles in its country's default pool,
  // which can differ from the partition's currency under a seed preset. Then
  // two partitions could share a pool, so they settle one at a time instead.
  const disjoint = acting.every((d) =>
    corpsByCountry
      .get(d.countryId)!
      .every(
        (c) =>
          (c.liquidCurrencyCode ?? "USD") !== d.homeCurrency ||
          equityPoolCurrency(c) === d.homeCurrency
      )
  );

  await boundedParallelMap(partitions, disjoint ? partitionConcurrency : 1, async (partition) => {
    const currency = partition[0].homeCurrency;
    const rng = makeSeededRng(`npp-stock-invest:${currentTurn}:${currency}${NPP_ACTION_RNG_SALT}`);
    const homeRate = fxByCcy.get(currency) ?? 1;
    for (const d of partition) {
      if (rng() >= d.baseProbability * d.multiplier) continue;
      // Live candidates: an earlier buy this sweep may have thinned a float.
      const candidates = stockCandidates(
        corpsByCountry.get(d.countryId)!,
        d.homeCurrency,
        d.riskToleranceMult
      );
      if (candidates.length === 0) continue;
      const chosen = candidates[pickStockCandidate(candidates, d.riskToleranceMult, rng())];
      const shares = stockBuyShares(d.cashAnchor, d.saveInvestAppetiteMult, homeRate, chosen);
      if (shares < 1) continue;
      const result = await nppBuyShares(
        db,
        d.npp,
        chosen.corp._id,
        shares,
        homeRate,
        chosen.corp,
        preset,
        pools
      );
      if (result.ok) chosen.corp.publicFloat = (chosen.corp.publicFloat ?? 0) - shares;
    }
  });
}
