import type { AnyBulkWriteOperation, Db } from "mongodb";
import type { GameConfig } from "@/lib/db/types/gameConfig";
import type { GovernmentFormation } from "@/lib/db/types/governmentFormation";
import type { Corporation, CorporateSector, SoeState } from "@/lib/db/types/corporation";
import type { CommodityFlow } from "@/lib/db/types/commodityFlow";
import { economicReformPull } from "@/lib/economy/economicSystemReformRules";
import {
  isPlannedEconomy,
  plannedShare,
  scheduledMarketizationLevel,
  DUAL_TRACK_CEILING,
  hydrateStoredMarketizationLevels,
  setStoredMarketizationLevel,
  marketizationLevel,
  marketizationDrift,
  driftMarketizationLevel,
  computePolicyStance,
  governmentReformismFromEconomicPosition,
  blendGovernmentReformism,
  marketizationGravity,
  NPP_DEFAULT_REFORMISM,
  NPP_DEFAULT_INTERNAL_REPRESSION,
} from "@/lib/constants/commandEconomy";
import {
  accumulateOverhang,
  shortageIndexFrom,
  blackMarketPremiumFrom,
  updateSecondEconomy,
  blackMarketPressure,
  overhangInjectionFromIssuance,
  repressionLegitimacyCost,
  countryPhysicalDemandSupplyGapPct,
} from "@/lib/economy/commandEconomyState";
import {
  aggregatePlanFulfillment,
  aggregateCapacityUtilisation,
  resolveCreditAllocation,
  applyDirectedCreditToSoe,
  directedCreditBudget,
  directedCreditIssuance,
  directedCreditCapacityUnits,
  soeCapacityReplacementCostAnchor,
  SOE_PERF_BASELINE,
} from "@/lib/economy/soe";
import { getMarketSystemModeForDb, marketAtLeast } from "@/lib/market/featureFlag";
import { getRegisteredCountryIds } from "@/lib/country/registeredCountries";
import { capacityPricePerUnit, CAPACITY_ANCHOR_YEAR } from "@/lib/constants/capacityEconomy";
import { plantChangePipeline } from "@/lib/corporations/plantLedger";
import { loadWholePlantsOn } from "@/lib/corporations/wholePlants/stage";
import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";
import {
  loadFxRatesByCurrency,
  fxRateForCorpFromMap,
  resolveCorpLiquidCurrencyCode,
  corpCapitalToAnchor,
  anchorToCorpCapital,
} from "@/lib/currency/corporationCapital";
import { wageFundConstrainedGrowth } from "@/lib/economy/twoCircuitMoney";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { resolveGosbankPosture } from "@/lib/economy/commandEconomyPosture";
import { getFederalBudgetCollection } from "@/lib/db/collections/federalBudget";
import { getCorporationsCollection } from "@/lib/db/collections/corporations";
import { getCorporateSectorsCollection } from "@/lib/db/collections/corporateSectors";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import type { Document } from "mongodb";
import { governmentFormationsCollection } from "@/lib/db/repositories/governmentFormations";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { commodityFlowsCollection } from "@/lib/db/repositories/commodityFlows";

/**
 * Command-economy macro turn phase. Advances shortage-economy state on
 * `FederalBudget.economicFactors`, refreshes SOE plan-fulfillment, and
 * drifts/persists per-country marketization. Active Gosbank directs credit
 * toward under-performing strategic SOEs (building capacity), monetizes the
 * unsaved slice into the overhang accumulator, and persists budget softness.
 * Self-gates on `commandEconomyEnabled`; no-op when off. Runs after
 * `inflationRecalc` so gdp/wage growth are fresh.
 */
export async function processCommandEconomyTurn(
  db: Db,
  _turn: number,
  currentYear?: number | null
): Promise<{ countriesUpdated: number }> {
  const config = await gameConfigCollection(db).findOne(
    { _id: "default" },
    { projection: { commandEconomyEnabled: 1, commandEconomySecondEconomyTolerance: 1 } }
  );
  const enabled = config?.commandEconomyEnabled === true;
  if (!enabled) return { countriesUpdated: 0 };

  const globalTolerance =
    typeof config?.commandEconomySecondEconomyTolerance === "number"
      ? config.commandEconomySecondEconomyTolerance
      : 0.3;

  // Per-country command posture from the NPP governing brain (commandStance):
  // second-economy tolerance + the P1 Gosbank levers (credit aggressiveness,
  // budget softness, government reformism). Absent → global / constant defaults.
  const formations = await governmentFormationsCollection(db)
    .find({}, { projection: { _id: 1, commandStance: 1, governingPartyId: 1 } })
    .toArray();
  const toleranceByCountry = new Map<string, number>();
  const stanceByCountry = new Map<
    string,
    {
      creditAggressiveness?: number;
      budgetSoftness?: number;
      reformism?: number;
      internalRepression?: number;
    }
  >();
  const governingPartyIdByCountry = new Map<string, number>();
  for (const gov of formations) {
    const id = String(gov._id);
    // P3: the elected ruling party (largest party's sequentialId) — the LIVE
    // government-reformism source, resolved to an economic position below.
    if (gov.governingPartyId != null) {
      const seq = Number(gov.governingPartyId);
      if (Number.isFinite(seq)) governingPartyIdByCountry.set(id, seq);
    }
    const cs = gov.commandStance;
    if (!cs) continue;
    if (
      typeof cs.secondEconomyTolerance === "number" &&
      Number.isFinite(cs.secondEconomyTolerance)
    ) {
      toleranceByCountry.set(id, Math.max(0, Math.min(1, cs.secondEconomyTolerance)));
    }
    stanceByCountry.set(id, {
      creditAggressiveness: cs.creditAggressiveness,
      budgetSoftness: cs.budgetSoftness,
      reformism: cs.reformism,
      internalRepression: cs.internalRepression,
    });
  }

  // ── LIVE government reformism (P3): who actually governs moves marketization ──
  // Resolve each governing party's economic position (−5 command-left … +5
  // market-right) → reformism [−1, 1]. Works for player- AND NPP-led governments
  // and shifts as elections change control or the ruling party moves its stance,
  // closing the P2 seam where reformism was only ever the NPP-brain's estimate.
  const govReformismByCountry = new Map<string, number>();
  if (governingPartyIdByCountry.size > 0) {
    const partyFilter = Array.from(governingPartyIdByCountry.entries()).map(
      ([countryId, sequentialId]) => ({ countryId, sequentialId })
    );
    const parties = await politicalPartiesCollection<Document>(db)
      .find(
        { $or: partyFilter },
        { projection: { countryId: 1, sequentialId: 1, economicPosition: 1 } }
      )
      .toArray();
    for (const p of parties) {
      const countryId = String(p.countryId);
      if (governingPartyIdByCountry.get(countryId) !== Number(p.sequentialId)) continue;
      const reformism = governmentReformismFromEconomicPosition(
        p.economicPosition as number | null | undefined
      );
      if (reformism != null) govReformismByCountry.set(countryId, reformism);
    }
  }

  // ── SOE plan-fulfillment refresh (market output, not yet persisted) ─────────
  // Recompute each SOE's realized output from its sectors; directed credit is
  // applied below (planned countries) before we persist and score fulfillment.
  // P3b: under the plants tier directed credit must buy REAL capacity, and the
  // overlay's `capacity` must be read off the sectors' capital stock rather than
  // carried forward as a free-floating number.
  const marketSystemMode = await getMarketSystemModeForDb(db);
  const plantsEnabled = marketAtLeast(marketSystemMode, "plants");
  const physicalGapByCountry = new Map<string, number>();
  if (marketAtLeast(marketSystemMode, "ledger") && _turn > 0) {
    const flowDocs = await commodityFlowsCollection(db)
      .find({ turn: _turn - 1 }, { projection: { byCountry: 1 } })
      .toArray();
    const rowsByCountry = new Map<string, CommodityFlow["byCountry"][string][]>();
    for (const doc of flowDocs) {
      for (const [countryId, row] of Object.entries(doc.byCountry ?? {})) {
        const rows = rowsByCountry.get(countryId) ?? [];
        rows.push(row);
        rowsByCountry.set(countryId, rows);
      }
    }
    for (const [countryId, rows] of rowsByCountry) {
      const gap = countryPhysicalDemandSupplyGapPct(rows);
      if (gap != null) physicalGapByCountry.set(countryId, gap);
    }
  }
  const {
    byCountry: soeStatesByCountry,
    finalStateByCorp,
    replacementLocalByCorp,
  } = await loadSoeStates(db, plantsEnabled, currentYear);
  /** corpId → directed credit awarded this turn (corp-local), plants path only. */
  const plantsCreditByCorp = new Map<string, number>();

  const budgets = await (await getFederalBudgetCollection(db)).find({}).toArray();

  // ── Hydrate the stored marketization registry for this turn ───────────────
  //
  // Gate on the PERSISTED level (schedule as fallback), never on
  // `isPlannedEconomy`: that accessor reads the registry this loop rebuilds
  // (empty after restart) and falls back to the compiled schedule, dropping
  // countries whose regime was merged in or whose stored level outlived the
  // schedule. A dissolved country keeps its budget doc for history, and the
  // schedule still calls it planned, so without the registry check it would be
  // hydrated and planned forever. Skipped entirely when the feature is off.
  const registeredForPlanning = enabled
    ? new Set<string>(await getRegisteredCountryIds(db))
    : new Set<string>();

  const hydration: Array<[string, number]> = [];
  for (const budget of budgets) {
    const countryId = budget.countryId;
    if (!countryId || !registeredForPlanning.has(countryId)) continue;
    const persisted = budget.economicFactors?.marketizationLevel;
    const level =
      typeof persisted === "number" && Number.isFinite(persisted)
        ? persisted
        : scheduledMarketizationLevel(countryId, currentYear);
    // A market-band level with nothing persisted is just the schedule's answer
    // and needs no entry. A PERSISTED market-band level must be hydrated: left
    // out, the accessor falls back to the era schedule, and a country that
    // reformed out of the plan (DD's schedule says command until 1990) would be
    // read as command again and dragged back by the next turn's drift.
    if (level >= DUAL_TRACK_CEILING && persisted == null) continue;
    hydration.push([countryId, level]);
  }
  hydrateStoredMarketizationLevels(hydration);

  let countriesUpdated = 0;
  /** Countries the planned loop below moved this turn. */
  const processedCountries = new Set<string>();
  for (const budget of budgets) {
    const countryId = budget.countryId;
    // Same registered gate as the hydration: an un-hydrated dissolved country
    // would otherwise fall back to its compiled schedule and read planned.
    if (!countryId || !registeredForPlanning.has(countryId)) continue;
    if (!isPlannedEconomy(countryId, currentYear, enabled)) continue;

    const share = plannedShare(countryId, currentYear, enabled);
    const factors = budget.economicFactors;
    const tolerance = toleranceByCountry.get(countryId) ?? globalTolerance;

    // ── Gosbank posture: P2 player directive > NPP commandStance > default ────
    const directive = factors?.gosbankDirective;
    const stance = stanceByCountry.get(countryId);
    const { creditAggressiveness, budgetSoftness } = resolveGosbankPosture(directive, stance);
    // Government reformism = the ruling party's CHARTERED line BLENDED with the
    // SITTING government's live command stance (not shadowed by it — see
    // `blendGovernmentReformism`). P3 gave the party position absolute
    // precedence, which froze the term: `politicalParties.economicPosition` is
    // written only by the player-only committee `positionShift` path, so in an
    // NPP-run one-party state it never changes and the dial could only fall.
    // Either input alone is used when it's the only one present; neither →
    // the neutral default.
    const reformism = firstFinite(
      [
        blendGovernmentReformism(govReformismByCountry.get(countryId), stance?.reformism),
        NPP_DEFAULT_REFORMISM,
      ],
      -1,
      1
    );

    // ── Internal repression: player directive > NPP stance > default ──────────
    // The hardliner's lever (0 none … 1 heavy): forces the black market down so
    // less shortage shows up as reform pressure, at a legitimacy cost below.
    const repressionDirectiveLevel = factors?.repressionDirective?.level;
    const internalRepression = firstFinite(
      [repressionDirectiveLevel, stance?.internalRepression, NPP_DEFAULT_INTERNAL_REPRESSION],
      0,
      1
    );

    // ── Directed credit → SOE capacity/output ────────────────────────────────
    const soes = soeStatesByCountry.get(countryId) ?? [];
    const aggPlanTarget = soes.reduce(
      (sum, s) => sum + (Number.isFinite(s.state.planTarget) ? s.state.planTarget : 0),
      0
    );
    const creditTotal = directedCreditBudget(aggPlanTarget, creditAggressiveness);
    // P2: honor the Gosbank Chair's explicit per-sector weighting when set, and
    // pull credit toward SOEs whose director requested investment.
    const allocation = resolveCreditAllocation(
      soes.map((s) => ({
        sector: s.state.sector,
        output: s.state.output,
        planTarget: s.state.planTarget,
        investmentRequest: s.state.directive?.investmentRequest,
      })),
      creditTotal,
      directive?.sectorCredit
    );
    const directedCreditReadout: Record<string, number> = {};
    // ── The replacement floor (the SOE capex channel) ──────────────────────
    //
    // An SOE's capacity is a physical stock that depreciates every turn and
    // the enterprise has no legitimate way to buy it back: the treasury
    // backstop covers only operating loss, and cash-rationed NPP reinvestment
    // excludes SOEs. In a command economy the intended channel is directed
    // credit from Gosbank, but the tranche is a posture-scaled allocation that
    // can fund well under one turn of wear. Floor each SOE's tranche at one
    // turn of depreciation replacement.
    //
    // BOUNDED AND PAID FOR. The floor holds capacity flat, never grows it (it
    // is priced off existing plant via `soeCapacityReplacementCostAnchor`),
    // and its monetized share feeds the monetary overhang via `creditTotal`
    // like any other printed rouble.
    //
    // THE FLOOR IGNORES `creditAggressiveness`. That lever sizes investment;
    // upkeep is not investment. With no other channel to buy back worn units,
    // switching the floor off would silently scrap plan capacity. Reporting it
    // separately as `directedCreditUpkeep` lets a chair at aggressiveness 0 see
    // why the overhang still rises.
    let creditTotalFunded = creditTotal;
    let upkeepTotal = 0;
    for (const { corpId, state } of soes) {
      let credit = allocation.get(state.sector) ?? 0;
      if (plantsEnabled) {
        const replacementFloor = replacementLocalByCorp.get(corpId) ?? 0;
        if (replacementFloor > credit) {
          creditTotalFunded += replacementFloor - credit;
          upkeepTotal += replacementFloor - credit;
          credit = replacementFloor;
        }
        // Deferred: the credit is converted to capacity units and $inc'd onto
        // the corp's sectors in one pass after the country loop (below), then
        // folded into the overlay. Nothing is credited to the overlay here —
        // under plants the money must buy a plant before it counts.
        plantsCreditByCorp.set(corpId, (plantsCreditByCorp.get(corpId) ?? 0) + credit);
      } else {
        finalStateByCorp.set(corpId, applyDirectedCreditToSoe(state, credit));
      }
      directedCreditReadout[state.sector] = Math.round(credit);
    }
    // Score AFTER credit — funding the right sectors lifts output.
    //
    // Two different scores, deliberately:
    //  - `soeFulfillment` (output / planTarget) is the DIRECTOR'S grade and the
    //    goods-availability signal, because a plan the enterprises missed is
    //    consumer goods the wage fund already paid for. It feeds the overhang.
    //  - `soePerf` (output / capacity) drives the MARKETIZATION dial, because
    //    `planTarget` is written by the Gosplan chair and using it here let the
    //    planner choose the denominator of their own grade and steer a world
    //    scalar with it. See `aggregateCapacityUtilisation`.
    const scoredSoes = soes.map((s) => finalStateByCorp.get(s.corpId)!);
    const soeFulfillment =
      soes.length > 0 ? aggregatePlanFulfillment(scoredSoes) : SOE_PERF_BASELINE;
    const soePerf = soes.length > 0 ? aggregateCapacityUtilisation(scoredSoes) : SOE_PERF_BASELINE;

    // ── Issuance → overhang (the tradeoff) ───────────────────────────────────
    // `creditTotalFunded` (not `creditTotal`) — the replacement floor above is
    // real credit and prints its unbacked share like any other tranche.
    const monetizedIssuance = directedCreditIssuance(creditTotalFunded);
    const creditInjection = overhangInjectionFromIssuance(monetizedIssuance, aggPlanTarget, share);

    const prevOverhang = factors?.monetaryOverhang ?? 0;
    const prevSecondShare = factors?.secondEconomyShare ?? 0;

    const constrainedWageGrowth = wageFundConstrainedGrowth(
      factors?.wageGrowth ?? 0,
      factors?.gdpGrowth ?? 0,
      share
    );

    const relief = updateSecondEconomy(
      prevSecondShare,
      factors?.shortageIndex ?? 0,
      prevOverhang,
      tolerance
    ).relief;

    const overhang = accumulateOverhang(
      prevOverhang,
      constrainedWageGrowth,
      factors?.gdpGrowth ?? 0,
      share,
      relief,
      creditInjection,
      soeFulfillment
    );
    const physicalGap = physicalGapByCountry.get(countryId);
    const shortageIndex = shortageIndexFrom(overhang, physicalGap ?? 0);
    const blackMarketPremium = blackMarketPremiumFrom(shortageIndex, overhang, tolerance);
    const secondEconomyShare = updateSecondEconomy(
      prevSecondShare,
      shortageIndex,
      overhang,
      tolerance
    ).share;

    // ── Endogenous marketization drift (fully free — no era gravity) ────────
    // Repression forces the black-market EXPRESSION down (premium + grey market),
    // so the effective pressure that drives reform is lower than the raw scarcity
    // would imply. The base (no-repression) pressure is kept as a readout so the
    // dashboard can show how far repression pushed it down. The overhang / shortage
    // computed above are untouched by repression — the goods still aren't there.
    const pressureBase = blackMarketPressure(shortageIndex, blackMarketPremium, secondEconomyShare);
    const pressure = blackMarketPressure(
      shortageIndex,
      blackMarketPremium,
      secondEconomyShare,
      internalRepression
    );
    // Legitimacy cost readout (also recomputed + applied by the one-party
    // legitimacy phase); climbs with repression × the still-present shortage.
    const repressionCost = repressionLegitimacyCost(internalRepression, shortageIndex);
    const policyStance = computePolicyStance(reformism, creditAggressiveness, budgetSoftness);
    const currentLevel = marketizationLevel(countryId, currentYear);
    // Free drivers + a weak, capped restoring pull toward the era schedule.
    // Gravity is exactly 0 while the level sits at its scheduled value and is
    // capped well below what the drivers can sustain, so it sets the DEFAULT
    // when nobody intervenes without ever railroading a determined government.
    // A legislated economic system replaces the era schedule as the anchor:
    // the dial ramps to the law's target, then rests there under weak gravity.
    const reform = factors?.economicReform;
    const reformPull = reform ? economicReformPull(currentLevel, reform) : null;
    const gravity =
      reformPull?.pull ??
      marketizationGravity(currentLevel, scheduledMarketizationLevel(countryId, currentYear));
    const drift = marketizationDrift(pressure, soePerf, policyStance) + gravity;
    const nextLevel = driftMarketizationLevel(currentLevel, drift);
    setStoredMarketizationLevel(countryId, nextLevel);
    processedCountries.add(countryId);
    const reformReachedNow = reform != null && reform.reachedAtTurn == null && reformPull?.reached;

    await federalBudgetCollection(db).updateOne(
      { _id: budget._id },
      {
        $set: {
          "economicFactors.monetaryOverhang": overhang,
          "economicFactors.shortageIndex": shortageIndex,
          ...(physicalGap != null
            ? { "economicFactors.physicalDemandSupplyGapPct": physicalGap }
            : {}),
          "economicFactors.blackMarketPremium": blackMarketPremium,
          "economicFactors.secondEconomyShare": secondEconomyShare,
          "economicFactors.wageGrowth": constrainedWageGrowth,
          "economicFactors.marketizationLevel": nextLevel,
          ...(reformReachedNow ? { "economicFactors.economicReform.reachedAtTurn": _turn } : {}),
          "economicFactors.budgetSoftness": budgetSoftness,
          "economicFactors.governmentReformism": reformism,
          "economicFactors.internalRepression": internalRepression,
          "economicFactors.repressionLegitimacyCost": repressionCost,
          "economicFactors.blackMarketPressureBase": pressureBase,
          "economicFactors.blackMarketPressureEffective": pressure,
          "economicFactors.directedCredit": directedCreditReadout,
          "economicFactors.directedCreditIssuance": Math.round(monetizedIssuance),
          // The slice of this turn's credit that only replaced worn-out
          // capacity. Zero when the investment budget already covered every
          // SOE's wear; positive whenever the floor had to top one up, which
          // is the whole of the bill at a zero-aggressiveness posture.
          "economicFactors.directedCreditUpkeep": Math.round(upkeepTotal),
        },
        ...(physicalGap == null
          ? { $unset: { "economicFactors.physicalDemandSupplyGapPct": "" } }
          : {}),
      }
    );
    countriesUpdated += 1;
  }

  // Legislated reform outside the planned band: a market-band country still
  // ramping up to a market target, or one legislating its way back to the
  // plan. The planned loop skipped these (no plan machinery runs above the
  // dual-track ceiling), so the law alone moves the dial. Once a counter-reform
  // takes the level below the ceiling the planned loop picks it up next turn.
  for (const budget of budgets) {
    const countryId = budget.countryId;
    const reform = budget.economicFactors?.economicReform;
    if (!countryId || !reform || processedCountries.has(countryId)) continue;
    if (!registeredForPlanning.has(countryId)) continue;
    // Above the planned band there is no endogenous drift, so a reached law
    // has nothing to correct.
    if (reform.reachedAtTurn != null) continue;
    const currentLevel = marketizationLevel(countryId, currentYear);
    const { pull, reached } = economicReformPull(currentLevel, reform);
    const nextLevel = driftMarketizationLevel(currentLevel, pull);
    setStoredMarketizationLevel(countryId, nextLevel);
    await federalBudgetCollection(db).updateOne(
      { _id: budget._id },
      {
        $set: {
          "economicFactors.marketizationLevel": nextLevel,
          ...(reached ? { "economicFactors.economicReform.reachedAtTurn": _turn } : {}),
        },
      }
    );
    countriesUpdated += 1;
  }

  // P3b: turn this turn's directed credit into real capacity on real sectors,
  // then fold what it bought into the overlay. Runs AFTER the country loop
  // because it is one bulk write over every planned country's SOE sectors.
  //
  // Ordering note: `soePerf` was already scored above without it, which is
  // correct under plants — plan fulfillment is output/planTarget and this
  // purchase raises CAPACITY, whose output arrives next turn when the sectors
  // actually produce from the larger capital stock. Below plants the (phantom)
  // same-turn output lift is preserved exactly.
  if (plantsEnabled && plantsCreditByCorp.size > 0) {
    const valueAdded = await buildCapacityFromDirectedCredit(db, plantsCreditByCorp, currentYear);
    for (const [corpId, capacityValueAdded] of valueAdded) {
      const state = finalStateByCorp.get(corpId);
      if (!state) continue;
      finalStateByCorp.set(
        corpId,
        applyDirectedCreditToSoe(state, plantsCreditByCorp.get(corpId) ?? 0, {
          capacityValueAdded,
        })
      );
    }
  }

  // Persist every SOE overlay (credited where a planned country funded it, plain
  // market-output refresh otherwise) in one bulk write.
  await persistSoeStates(db, finalStateByCorp);

  return { countriesUpdated };
}

/** First finite entry in `values`, clamped to [lo, hi]. Falls back to lo. */
function firstFinite(values: Array<number | undefined | null>, lo: number, hi: number): number {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return Math.max(lo, Math.min(hi, v));
  }
  return lo;
}

/**
 * Recompute every SOE's overlay from its sectors' realized output (WITHOUT
 * persisting — the caller applies directed credit for planned countries first,
 * then persists). Returns the per-country grouping and a corpId → state map
 * seeded with the market-output refresh (credit overwrites entries in place).
 *
 * output       = Σ sector realizedRevenue (falls back to nominal revenue).
 * planTarget   = the seeded plan quota (unchanged in P0; Gosplan sets it in P2).
 * efficiency   = EMA of output/capacity (how well capacity is being used).
 * cumulativeLosses accrues the per-turn plan shortfall (soft budget).
 */
async function loadSoeStates(
  db: Db,
  /**
   * P3b (plants tier): derive `capacity` from the sectors' CAPITAL STOCK priced
   * at their output mix, instead of carrying the previous overlay value
   * forward. See the comment at the assignment below.
   */
  plantsEnabled: boolean = false,
  /** Game year, for era-pricing the replacement floor. Plants path only. */
  currentYear?: number | null
): Promise<{
  byCountry: Map<string, Array<{ corpId: string; state: SoeState }>>;
  finalStateByCorp: Map<string, SoeState>;
  /**
   * corpId → the CORP-LOCAL cost of replacing one turn of depreciation on the
   * capacity it already owns. The floor the Gosbank tranche is lifted to under
   * plants — see `soeCapacityReplacementCostAnchor`. Empty below plants.
   */
  replacementLocalByCorp: Map<string, number>;
}> {
  const byCountry = new Map<string, Array<{ corpId: string; state: SoeState }>>();
  const finalStateByCorp = new Map<string, SoeState>();
  const replacementLocalByCorp = new Map<string, number>();

  const soeCorps = await (
    await getCorporationsCollection(db)
  )
    .find(
      { soe: { $exists: true } },
      { projection: { _id: 1, countryId: 1, soe: 1, liquidCurrencyCode: 1 } }
    )
    .toArray();
  if (soeCorps.length === 0) return { byCountry, finalStateByCorp, replacementLocalByCorp };

  const soeIds = soeCorps.map((c) => c._id);
  const sectors = await (
    await getCorporateSectorsCollection(db)
  )
    .find(
      { corporationId: { $in: soeIds } },
      {
        projection: {
          corporationId: 1,
          revenue: 1,
          realizedRevenue: 1,
          capitalStock: 1,
          sectorType: 1,
        },
      }
    )
    .toArray();

  if (plantsEnabled) {
    const fxByCurrency = await loadFxRatesByCurrency(db);
    const sectorsByCorp = new Map<string, CorporateSector[]>();
    for (const sec of sectors) {
      const k = String(sec.corporationId);
      sectorsByCorp.set(k, [...(sectorsByCorp.get(k) ?? []), sec]);
    }
    const soeUnitScale = await loadWorldEraUnitScale(db);
    for (const corp of soeCorps) {
      const anchor = soeCapacityReplacementCostAnchor(
        sectorsByCorp.get(String(corp._id)) ?? [],
        currentYear,
        soeUnitScale
      );
      if (!(anchor > 0)) continue;
      const local = anchorToCorpCapital(
        anchor,
        resolveCorpLiquidCurrencyCode(corp),
        fxRateForCorpFromMap(corp, fxByCurrency)
      );
      if (local > 0) replacementLocalByCorp.set(String(corp._id), local);
    }
  }

  const realizedByCorp = new Map<string, number>();
  const nominalByCorp = new Map<string, number>();
  /** Σ capitalStock × mixPrice — the plants-tier capacity valuation. */
  const capacityValueByCorp = new Map<string, number>();
  for (const sec of sectors) {
    const key = String(sec.corporationId);
    const nominal = Number.isFinite(sec.revenue) ? sec.revenue : 0;
    // Under plants a sector's stored `revenue` IS `capitalStock × mixPrice`
    // (sectorTurn writes the capacity-implied nameplate, deliberately not the
    // realized figure), so mixPrice = revenue / capitalStock and the product
    // below is the capacity valuation stated in the same currency as
    // `planTarget`. Written the long way on purpose: it is the identity that
    // makes this a CAPACITY reading rather than a revenue sum, and it goes to
    // zero for a sector with no capital stock instead of inheriting a
    // compounding revenue number.
    const capitalStock = Number.isFinite(sec.capitalStock) ? (sec.capitalStock as number) : 0;
    if (capitalStock > 0) {
      const mixPrice = nominal / capitalStock;
      capacityValueByCorp.set(key, (capacityValueByCorp.get(key) ?? 0) + capitalStock * mixPrice);
    }
    const realized =
      typeof sec.realizedRevenue === "number" && Number.isFinite(sec.realizedRevenue)
        ? sec.realizedRevenue
        : nominal;
    realizedByCorp.set(key, (realizedByCorp.get(key) ?? 0) + realized);
    nominalByCorp.set(key, (nominalByCorp.get(key) ?? 0) + nominal);
  }

  for (const corp of soeCorps) {
    const prev = corp.soe;
    if (!prev) continue;
    const key = String(corp._id);
    const realized = realizedByCorp.get(key);
    const output = realized != null ? Math.round(realized) : prev.output;
    const planTarget =
      prev.planTarget > 0 ? prev.planTarget : Math.round(nominalByCorp.get(key) ?? 0);
    const plantsCapacityValue = Math.round(capacityValueByCorp.get(key) ?? 0);
    const capacity =
      plantsEnabled && plantsCapacityValue > 0
        ? plantsCapacityValue
        : prev.capacity > 0
          ? prev.capacity
          : Math.max(output, planTarget);
    const capUse = capacity > 0 ? output / capacity : 1;
    // P2: the director's labour-vs-quality lever nudges the efficiency trend —
    // a quality focus (>0.5) lifts it, a raw-output focus (<0.5) drags it.
    const laborQuality = prev.directive?.laborQuality;
    const qualityBias =
      typeof laborQuality === "number" && Number.isFinite(laborQuality)
        ? (laborQuality - 0.5) * 0.2
        : 0;
    const efficiency = clampNum((prev.efficiency ?? 1) * 0.9 + (capUse + qualityBias) * 0.1, 0, 3);
    const shortfall = Math.max(0, planTarget - output);
    const cumulativeLosses = (prev.cumulativeLosses ?? 0) + shortfall / TURNS_PER_YEAR;

    const next: SoeState = {
      ...prev,
      output,
      planTarget,
      capacity,
      efficiency,
      cumulativeLosses,
    };
    finalStateByCorp.set(key, next);
    const country = corp.countryId ?? "";
    if (!byCountry.has(country)) byCountry.set(country, []);
    byCountry.get(country)!.push({ corpId: key, state: next });
  }

  return { byCountry, finalStateByCorp, replacementLocalByCorp };
}

/**
 * Turn directed credit into real capacity (plants tier only): split each SOE
 * tranche pro-rata by `capitalStock` (evenly if none), buy units at
 * `capacityPricePerUnit`, and `$inc` them onto `capitalStock`. Same era-priced
 * ₳/unit a private CEO pays, so credit is a funding channel, not a discount.
 *
 * Capacity lands immediately rather than through the build queue: the tranche is
 * a per-turn flow across every SOE sector, and the overlay is a plan reading, not
 * a balance sheet. `directedCreditIssuance` is untouched either way.
 *
 * FX: `credit` is corp-local; price is ₳, so normalize by the corp's own rate.
 *
 * Returns corpId → capacity value added in corp-local units (unitsAdded ×
 * mixPrice).
 */
async function buildCapacityFromDirectedCredit(
  db: Db,
  creditByCorp: ReadonlyMap<string, number>,
  currentYear: number | null | undefined
): Promise<Map<string, number>> {
  const valueAddedByCorp = new Map<string, number>();
  const { ObjectId } = await import("mongodb");
  const corpIds = [...creditByCorp.keys()].map((id) => new ObjectId(id));
  const [corps, sectors, fxByCurrency, wholePlants] = await Promise.all([
    (await getCorporationsCollection(db))
      .find({ _id: { $in: corpIds } }, { projection: { _id: 1, liquidCurrencyCode: 1 } })
      .toArray(),
    (await getCorporateSectorsCollection(db))
      .find(
        { corporationId: { $in: corpIds } },
        {
          projection: {
            _id: 1,
            corporationId: 1,
            sectorType: 1,
            // Plant size: lane, operating model and recipe.
            industryModel: 1,
            mediaDiscriminator: 1,
            strategyId: 1,
            capitalStock: 1,
            capacityBookAnchor: 1,
            revenue: 1,
          },
        }
      )
      .toArray(),
    loadFxRatesByCurrency(db),
    loadWholePlantsOn(db),
  ]);
  const corpById = new Map(corps.map((c) => [String(c._id), c]));
  const sectorsByCorp = new Map<string, CorporateSector[]>();
  for (const s of sectors) {
    const k = String(s.corporationId);
    sectorsByCorp.set(k, [...(sectorsByCorp.get(k) ?? []), s]);
  }

  const year = currentYear ?? CAPACITY_ANCHOR_YEAR;
  const creditUnitScale = await loadWorldEraUnitScale(db);
  const ops: AnyBulkWriteOperation<CorporateSector>[] = [];
  for (const [corpId, creditLocal] of creditByCorp) {
    if (!(creditLocal > 0)) continue;
    const corpSectors = sectorsByCorp.get(corpId) ?? [];
    if (corpSectors.length === 0) continue;
    const corp = corpById.get(corpId);
    const code = corp ? resolveCorpLiquidCurrencyCode(corp) : undefined;
    const rate = corp ? fxRateForCorpFromMap(corp, fxByCurrency) : 1;
    const creditAnchor = corpCapitalToAnchor(creditLocal, code, rate);
    if (!(creditAnchor > 0)) continue;

    const stockTotal = corpSectors.reduce(
      (sum, s) =>
        sum + Math.max(0, Number.isFinite(s.capitalStock) ? (s.capitalStock as number) : 0),
      0
    );
    let valueAddedLocal = 0;
    for (const sector of corpSectors) {
      const stock = Math.max(
        0,
        Number.isFinite(sector.capitalStock) ? (sector.capitalStock as number) : 0
      );
      const share = stockTotal > 0 ? stock / stockTotal : 1 / corpSectors.length;
      const unitPrice = capacityPricePerUnit(
        sector.sectorType,
        year,
        creditUnitScale,
        sector.strategyId ?? null
      );
      const unitsAdded = directedCreditCapacityUnits(creditAnchor * share, unitPrice);
      if (!(unitsAdded > 0)) continue;
      // P5: directed credit is REAL cash spent at the standing list price, so it
      // adds a real paid basis — the SOE can exit this capacity for what the
      // state paid for it, and no more. Written as an absolute `$set` (with the
      // list-price fallback as the prior) rather than an `$inc`, so a sector
      // that has no recorded basis yet is stamped at its honest value instead
      // of being reset to just this tranche.
      const priorBook =
        typeof sector.capacityBookAnchor === "number" &&
        Number.isFinite(sector.capacityBookAnchor) &&
        sector.capacityBookAnchor >= 0
          ? sector.capacityBookAnchor
          : stock * unitPrice;
      ops.push({
        updateOne: {
          filter: { _id: sector._id },
          update: plantChangePipeline(
            sector,
            unitsAdded,
            { capacityBookAnchor: priorBook + unitsAdded * unitPrice },
            { wholePlants }
          ),
        },
      });
      // mixPrice (corp-local) = revenue / capitalStock under plants; a sector
      // with no stock yet has no price to read, so its purchase is valued at
      // the tranche that bought it (the anchor→local round trip).
      const revenue = Number.isFinite(sector.revenue) ? sector.revenue : 0;
      valueAddedLocal +=
        stock > 0 && revenue > 0
          ? unitsAdded * (revenue / stock)
          : anchorToCorpCapital(creditAnchor * share, code, rate);
    }
    if (valueAddedLocal > 0) valueAddedByCorp.set(corpId, valueAddedLocal);
  }
  if (ops.length > 0) await (await getCorporateSectorsCollection(db)).bulkWrite(ops);
  return valueAddedByCorp;
}

/** Bulk-persist the final SOE overlays (post market-refresh + directed credit). */
async function persistSoeStates(db: Db, finalStateByCorp: Map<string, SoeState>): Promise<void> {
  if (finalStateByCorp.size === 0) return;
  const { ObjectId } = await import("mongodb");
  const ops: AnyBulkWriteOperation<Corporation>[] = [];
  for (const [corpId, state] of finalStateByCorp) {
    ops.push({
      updateOne: { filter: { _id: new ObjectId(corpId) }, update: { $set: { soe: state } } },
    });
  }
  await (await getCorporationsCollection(db)).bulkWrite(ops);
}

const clampNum = (v: number, lo: number, hi: number): number =>
  !Number.isFinite(v) ? lo : Math.min(hi, Math.max(lo, v));
