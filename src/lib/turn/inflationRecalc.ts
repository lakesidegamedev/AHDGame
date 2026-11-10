import { currentMoneyGrowth } from "@/lib/moneySupply/rules/growthSignal";
/**
 * Inflation is recalculated every turn. recalculateInflationPerTurn reads each
 * country's prime rate, unemployment, GDP growth, deficit, tariffs, wage growth,
 * the commodity price trend over the last half game year, exchange rate moves and
 * money supply, then stores the new inflationRate and advances the household
 * price index.
 */
/**
 * Per-Turn Inflation Recalculation
 *
 * Recalculates inflation each turn so the economic trends chart reflects
 * real-time changes in monetary policy, unemployment, GDP growth, fiscal
 * stance, tariffs, and wage growth — rather than showing a flat line
 * between annual fiscal-year recalculations.
 *
 * Runs after nationalMetrics (so GDP growth / unemployment are current)
 * and before the interest-rate snapshot captures the value for history.
 */

import type { Db } from "mongodb";
import type { FederalBudget } from "@/lib/db/types/budget";
import type { ExchangeRate } from "@/lib/db/types/exchangeRate";
import type { StateMetrics } from "@/lib/db/types/stateMetrics";
import { calculateCountryInflation, PEGGED_MONEY_GROWTH_COEFF } from "@/lib/budget/inflation";
import { moneyGrowthCoefficient, resolveMonetaryRegime } from "@/lib/monetary/brettonWoods";
import { savingsFlowPressureRatio } from "@/lib/budget/savingsFlowPressure";
import { getCentralBankScope } from "@/lib/centralBank/helpers";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { COUNTRY_CURRENCY_MAP, getCountryIdForCurrency } from "@/lib/constants/currencies";
import { getNationalDocId } from "@/lib/constants/nationalScope";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import { ensureFederalBudget } from "@/lib/turn/ensureFederalBudget";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import {
  advanceHouseholdPriceIndex,
  HOUSEHOLD_PRICE_INDEX_BASELINE,
} from "@/lib/economy/householdPriceIndex";
import { subhourStepStamp } from "@/lib/turn/subhour/stepFraction";
import {
  activeSubhourBase,
  restoreAdditive,
  restoreMultiplicative,
  type SubhourInflationBase,
} from "@/lib/turn/subhour/stepBase";
import { calculateFxInflationPressure } from "@/lib/turn/rules/fxInflationPressure";
import {
  commodityPressureForCountry,
  loadCommodityPressureSnapshots,
} from "@/lib/turn/commodityInflationPressure";
import {
  countryTurnTariffInflationExposure,
  loadTurnTariffInflationExposure,
  measuredTariffInflationRate,
} from "@/lib/tariffs/tariffInflationExposure";
import { getFederalBudgetCollection } from "@/lib/db/collections/federalBudget";
import { getGameStateCollection } from "@/lib/db/collections/gameState";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";

export interface InflationRecalcOptions {
  /**
   * Share of the coming turn's step to apply now, in (0, 1). Set only by the
   * :30 half tick (see turn/subhour/stepFraction.ts). Omitted = the turn.
   */
  stepFraction?: number;
}

export interface InflationRecalcStats {
  updated: number;
  /** Half tick only: budgets already half-stepped for this turn. */
  alreadyStepped: number;
  /** Turn only: budgets restored to their pre-:30 start before stepping. */
  rewound: number;
}

/**
 * Recalculate inflation for every country that has a central bank and
 * a federal budget, then persist the updated rate to the budget document.
 *
 * Returns the number of countries updated.
 */
export async function recalculateInflationPerTurn(db: Db, turn: number): Promise<number> {
  return (await runInflationRecalc(db, turn)).updated;
}

/**
 * Inflation step for every country.
 *
 * Turn: a budget stamped at :30 is first restored to its start-of-hour
 * inflation, then takes the full step; unstamped budgets compute as before.
 *
 * Half tick (stepFraction 0.5): applies the same model partway along the
 * turn's adjustment path, stores start values with the stamp, leaves savings
 * pressure alone, and writes via one bulkWrite without creating budgets.
 */
export async function runInflationRecalc(
  db: Db,
  turn: number,
  options: InflationRecalcOptions = {}
): Promise<InflationRecalcStats> {
  const fraction = options.stepFraction;
  const halfStep =
    typeof fraction === "number" && Number.isFinite(fraction) && fraction > 0 && fraction < 1;
  const stepFraction = halfStep ? fraction : undefined;
  const halfFraction = stepFraction ?? 1;
  // Only the half tick passes a fraction; the turn calls with the same
  // arguments as before.
  const stepArgs: [] | [number] = stepFraction === undefined ? [] : [stepFraction];
  // Same-turn series (this turn's commodity price row, its sourcing flows) only
  // exist once the turn has run; the half tick reads the last settled turn's.
  const priceTurn = halfStep ? turn - 1 : turn;
  const stats: InflationRecalcStats = { updated: 0, alreadyStepped: 0, rewound: 0 };
  const halfStepOps: Array<{
    updateOne: { filter: { _id: FederalBudget["_id"] }; update: { $set: Record<string, unknown> } };
  }> = [];
  const now = new Date();

  /**
   * Step one budget and persist it. `compute` returns the new annual rate from
   * the budget it is handed (the start-of-hour budget at the turn).
   */
  const settle = async (
    budget: FederalBudget,
    compute: (start: FederalBudget) => Promise<number>
  ): Promise<boolean> => {
    const stamped = activeSubhourBase(budget.subhourStep, budget.subhourBase?.inflation, turn);
    if (halfStep) {
      // Already half-stepped this hour (a retried tick): never apply it twice.
      if (stamped) {
        stats.alreadyStepped++;
        return false;
      }
      const startInflation = budget.economicFactors?.inflationRate;
      if (typeof startInflation !== "number" || !Number.isFinite(startInflation)) return false;
      const rawIndex = budget.economicFactors?.householdPriceIndex;
      // advanceHouseholdPriceIndex reads a missing or broken index as the
      // baseline, so storing the baseline restores the same start.
      const startIndex =
        typeof rawIndex === "number" && Number.isFinite(rawIndex) && rawIndex > 0
          ? rawIndex
          : HOUSEHOLD_PRICE_INDEX_BASELINE;
      const newInflation = await compute(budget);
      const householdPriceIndex = advanceHouseholdPriceIndex(
        startIndex,
        newInflation,
        halfFraction
      );
      const base: SubhourInflationBase = {
        turn,
        inflationRate: { base: startInflation, written: newInflation },
        householdPriceIndex: { base: startIndex, written: householdPriceIndex },
      };
      halfStepOps.push({
        updateOne: {
          filter: { _id: budget._id },
          update: {
            $set: {
              "economicFactors.inflationRate": newInflation,
              "economicFactors.householdPriceIndex": householdPriceIndex,
              "economicFactors.lastUpdated": now,
              subhourStep: subhourStepStamp(turn, halfFraction),
              "subhourBase.inflation": base,
            },
          },
        },
      });
      return true;
    }

    const start: FederalBudget = stamped
      ? {
          ...budget,
          economicFactors: {
            ...budget.economicFactors,
            inflationRate: restoreAdditive(
              budget.economicFactors?.inflationRate,
              stamped.inflationRate
            ),
            householdPriceIndex: restoreMultiplicative(
              budget.economicFactors?.householdPriceIndex,
              stamped.householdPriceIndex
            ),
          },
        }
      : budget;
    const newInflation = await compute(start);
    // Household prices trail the newly settled CPI, but never feed back
    // into its calculation. This gives inflation a visible purchasing-
    // power consequence without turning it into a nominal unit rescaler.
    const householdPriceIndex = advanceHouseholdPriceIndex(
      start.economicFactors?.householdPriceIndex,
      newInflation
    );
    const set = {
      "economicFactors.inflationRate": newInflation,
      "economicFactors.householdPriceIndex": householdPriceIndex,
      "economicFactors.lastUpdated": new Date(),
    };
    await (
      await getFederalBudgetCollection(db)
    ).updateOne(
      { _id: budget._id },
      stamped
        ? { $set: set, $unset: { "subhourBase.inflation": "" } }
        : {
            $set: set,
          }
    );
    if (stamped) stats.rewound++;
    return true;
  };

  const banks = await centralBanksCollection(db).find({}).toArray();
  // The half tick reads every budget once up front; it never self-heals a
  // missing one (the turn does, through ensureFederalBudget).
  const halfStepBudgets = halfStep
    ? new Map(
        (await (await getFederalBudgetCollection(db)).find({}).toArray()).map((b) => [
          String(b._id),
          b,
        ])
      )
    : null;

  const gameStateDoc = await (await getGameStateCollection(db)).findOne({ _id: "current" });
  const preset = gameStateDoc?.preset ?? DEFAULT_SEED_PRESET;

  // Pre-fetch exchange rates and 12-turn savings flows once.
  // Exchange rates used are previous turn's settled values (inflationRecalc runs before forexTurn).
  const [exchangeRateDocs, moneyRows, savingsFlowAgg, tariffExposureSnapshot] = await Promise.all([
    db.collection<ExchangeRate>("exchangeRates").find({}).toArray(),
    db
      .collection("moneySupplySnapshots")
      .aggregate<{ _id: string; accountingVersion?: number; annualizedM2GrowthPct: number | null }>(
        [
          { $match: { turn: { $lt: turn } } },
          { $sort: { currencyCode: 1, turn: -1 } },
          {
            $group: {
              _id: "$currencyCode",
              annualizedM2GrowthPct: { $first: "$annualizedM2GrowthPct" },
              accountingVersion: { $first: "$accountingVersion" },
            },
          },
        ]
      )
      .toArray(),
    // 12-turn rolling savings flows. countryId on ledger entries reflects currency jurisdiction,
    // matching nationalSavingsBalance on centralBanks (both keyed by currency, not character nationality).
    db
      .collection("savingsLedger")
      .aggregate<{ _id: { countryId: string; type: string }; total: number }>([
        {
          $match: {
            type: { $in: ["deposit", "withdraw"] },
            turn: { $gte: turn - 12 },
          },
        },
        {
          $group: {
            _id: { countryId: "$countryId", type: "$type" },
            total: { $sum: "$amount" },
          },
        },
      ])
      .toArray(),
    loadTurnTariffInflationExposure(db, priceTurn),
  ]);
  // `annualizedM2GrowthPct` is null until the lookback window reaches a
  // game-quarter (see MIN_MONEY_GROWTH_BASE_TURNS) — annualizing a stock jump
  // over one or two turns raises the ratio to the 24th power. The consumer
  // below reads this through `finiteOr(..., gdpGrowth)`, which already treats a
  // non-number as "no signal" and falls back, so a null degrades to a zero
  // monetary impulse rather than asserting the money supply is frozen.
  const moneyGrowthByCurrency = new Map<string, number | null>();
  for (const row of moneyRows) {
    moneyGrowthByCurrency.set(row._id, currentMoneyGrowth(row));
  }
  // The commodity cost-push signal is the CHANGE in national prices over the
  // lookback, not today's level. Kept out of the Promise.all above on purpose:
  // adding elements to that tuple pushes tsc's inference over a cliff and the
  // typecheck OOMs.
  const commodityPressureSnapshots = await loadCommodityPressureSnapshots(db, priceTurn);
  const exchangeRateByCountry = new Map(exchangeRateDocs.map((r) => [r.countryId, r]));

  // Build per-country savings flow map: { deposits, withdrawals } in local currency
  const savingsFlowByCountry = new Map<string, { deposits: number; withdrawals: number }>();
  for (const row of savingsFlowAgg) {
    const { countryId, type } = row._id;
    if (!savingsFlowByCountry.has(countryId)) {
      savingsFlowByCountry.set(countryId, { deposits: 0, withdrawals: 0 });
    }
    const entry = savingsFlowByCountry.get(countryId)!;
    if (type === "deposit") entry.deposits += row.total;
    else if (type === "withdraw") entry.withdrawals += row.total;
  }

  // `?? fallback` / `!= null` checks do NOT reject NaN (typeof NaN === "number");
  // any NaN in a persisted price or rate would poison inflation and recurse every
  // turn. Guard all derived pressure signals with a finite-only filter.
  const finiteOr = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

  // Countries covered by a central bank, collected as we go so the unbanked
  // pass below knows who it still has to recompute.
  const bankedCountries = new Set<string>();
  // Banks are independent (disjoint member sets, per-country budget writes),
  // and so are the members within a bank — fan both levels out instead of the
  // old strictly serial walk.
  await Promise.all(
    banks.map(async (bank) => {
      const bankCountryId = bank.countryId as CountryId;
      if (!COUNTRY_CONFIGS[bankCountryId]) return;

      // A shared bank (e.g. the ECB — one doc for all eurozone members, with
      // `countryId` set to the anchor member) must recalculate EVERY member
      // country's inflation, not just the one recorded on the doc. Otherwise the
      // other members' inflation and wage growth freeze forever and crisis $inc
      // shocks never decay (IE froze at 15.34% while DE tracked normally).
      const { memberCountries } = await getCentralBankScope(db, bankCountryId);

      // Savings flow pressure is a property of the bank's currency jurisdiction:
      // ledger entries carry the currency's anchor countryId (= bank.countryId for
      // every real bank) and the balance lives on the bank doc, so all members of
      // a shared bank see the same pressure.
      const flow = savingsFlowByCountry.get(bankCountryId);
      const totalBalance = bank.nationalSavingsBalance ?? 0;
      const deposits = flow?.deposits ?? 0;
      const withdrawals = flow?.withdrawals ?? 0;
      const savingsPressureRaw = savingsFlowPressureRatio(
        withdrawals - deposits,
        deposits + withdrawals,
        totalBalance
      );
      const savingsPressure = finiteOr(savingsPressureRaw, 0);

      let membersUpdated = 0;

      for (const member of memberCountries) bankedCountries.add(String(member));
      await Promise.all(
        memberCountries.map(async (countryId) => {
          const config = COUNTRY_CONFIGS[countryId];
          if (!config) return;

          // Commodity cost-push: the MEDIAN annualized CHANGE in this country's
          // national prices. 0.0 until a lookback window exists.
          //
          // Uses a rate of change, not a price level against a frozen seed basePrice.
          // A level term becomes a large, permanently growing constant that no policy
          // can answer, because a high price level is not inflation. A rate of change
          // decays to zero when prices settle, so CPI can reach target again.
          //
          // Median, not mean: a few commodities in acute scarcity would otherwise drag
          // the basket and rebuild a spurious permanent term.
          const commodityPressureRaw = commodityPressureForCountry(
            commodityPressureSnapshots,
            countryId
          );
          const commodityPressure = finiteOr(commodityPressureRaw, 0);

          // Forex depreciation cost-push: annualized FX movement across the recent
          // finite pass-through window. A currency held at a new rate produces no
          // further pressure after the old endpoint leaves the window. The initial
          // seeded rate is a baseline, not an inflation signal. Uses prior settled
          // snapshots because forexTurn runs after inflationRecalc.
          // Members without their own doc (eurozone: only the EUR anchor DE carries
          // one) inherit the currency anchor's rate so they feel the same FX signal.
          const currencyCode = COUNTRY_CURRENCY_MAP[countryId];
          const currencyAnchorId = currencyCode ? getCountryIdForCurrency(currencyCode) : countryId;
          const fxDoc =
            exchangeRateByCountry.get(countryId) ?? exchangeRateByCountry.get(currencyAnchorId);
          const forexPressure = calculateFxInflationPressure(fxDoc?.rateHistory ?? [], turn);

          const budget = halfStepBudgets
            ? (halfStepBudgets.get(String(getNationalBudgetId(countryId))) ?? null)
            : await ensureFederalBudget(db, countryId, preset);
          if (!budget) return;

          const nationalDocId = getNationalDocId(countryId);
          const nationalMetrics = nationalDocId
            ? await db.collection<StateMetrics>("macroMetrics").findOne({ _id: nationalDocId })
            : null;
          const gdpGrowth = finiteOr(nationalMetrics?.economic?.gdpGrowth?.value, 2.0);
          const policyStancePressure = finiteOr(bank.policyInflationPressure, 0);
          const moneySupplyGrowthPct = finiteOr(moneyGrowthByCurrency.get(currencyCode), gdpGrowth);

          // Bretton Woods exit (issue #7): post-float money growth is no longer
          // disciplined by convertibility. The regime is this turn's stored
          // value — brettonWoodsTurn runs after this phase, so a same-turn
          // suspension prices through starting next turn. Absent/pegged keeps
          // the pegged default, so flag-off worlds compute byte-identically.
          // Members without their own doc inherit the anchor's regime with the
          // rate above.
          const bwMoneyGrowthCoeff = moneyGrowthCoefficient(
            resolveMonetaryRegime(fxDoc?.monetaryRegime),
            PEGGED_MONEY_GROWTH_COEFF
          );

          const stepped = await settle(budget, (start) =>
            calculateCountryInflation(
              db,
              countryId,
              start,
              commodityPressure,
              forexPressure,
              savingsPressure,
              policyStancePressure,
              moneySupplyGrowthPct,
              bwMoneyGrowthCoeff,
              measuredTariffInflationRate(
                countryTurnTariffInflationExposure(tariffExposureSnapshot, countryId)
              ),
              ...stepArgs
            )
          );
          if (!stepped) return;

          membersUpdated++;
          stats.updated++;
        })
      );

      if (membersUpdated > 0 && !halfStep) {
        // Persist current pressure so interestRateSnapshot can chart it without
        // re-aggregating. Stored as a percentage (×100) to match the chart's %
        // y-axis convention. Keyed by the bank doc's _id — the previous
        // `{ _id: countryId }` write was a silent no-op for shared banks whose
        // _id ("ECB") differs from their countryId.
        await centralBanksCollection(db).updateOne(
          { _id: bank._id },
          { $set: { currentSavingsPressure: savingsPressure * 100 } }
        );
      }
    })
  );

  // Countries with NO central bank still need their inflation recomputed
  // every turn: crisisTurn `$inc`s inflation assuming the per-turn recalc will
  // blend it through inertia, and without this loop those shocks accumulate
  // unbounded. These countries have no monetary policy, so they take the plain
  // recompute: administered target for planned economies, else the ordinary
  // market model.
  const unbanked = await (
    await getFederalBudgetCollection(db)
  )
    .find({ countryId: { $nin: [...bankedCountries] } })
    .toArray();
  await Promise.all(
    unbanked.map(async (budget) => {
      const countryId = budget.countryId as CountryId | undefined;
      if (!countryId || !COUNTRY_CONFIGS[countryId]) return;
      const tariffRate = measuredTariffInflationRate(
        countryTurnTariffInflationExposure(tariffExposureSnapshot, countryId)
      );
      const stepped = await settle(budget, (start) =>
        calculateCountryInflation(
          db,
          countryId,
          start,
          0,
          0,
          0,
          0,
          undefined,
          undefined,
          tariffRate,
          ...stepArgs
        )
      );
      if (!stepped) return;
      stats.updated++;
    })
  );

  if (halfStepOps.length > 0) {
    await (await getFederalBudgetCollection(db)).bulkWrite(halfStepOps, { ordered: false });
  }
  return stats;
}
