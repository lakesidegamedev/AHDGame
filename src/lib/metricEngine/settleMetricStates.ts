import { advanceProductivity, type ProductivityState } from "@/lib/resetMetrics/rules/productivity";

import { advanceEmployment, type EmploymentState } from "@/lib/labour/rules/employment";
import { RESET_V2_READY } from "@/lib/resetVersions/availability";
import { resetSystemVersionsForCountry } from "@/lib/resetVersions/rules";

import { sumObservedOutput, outputHistorySpanTurns } from "@/lib/metricEngine/rules/outputVolume";

import { getEraEnvelope } from "@/lib/era/metricCatalog";

import { getNationalDocId } from "@/lib/constants/nationalScope";
import { synergyNudges, applySpendingEfficiency } from "@/lib/economicModels/effects";

import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";

import {
  advanceRevenueEma,
  getNeutralFederalSalesTaxRate,
  getNeutralStateSalesTaxRate,
  selectRevenueTrendBaseline,
  sumHostRealizedRevenue,
  sumRealizedRevenue,
  updateRevenueSnapshots,
} from "@/lib/turn/gdpGrowth";
import { evaluateRegistry } from "@/lib/metricEngine/evaluate";
import { compoundGdpLevel } from "@/lib/metricEngine/gdpLevel";
import { toNominalOutput, toRealOutput } from "@/lib/metricEngine/priceLevel";
import { advanceCapitalStock, seedCapitalStock } from "@/lib/metricEngine/capitalStock";
import { combineAdditionalCapitalInvestment } from "@/lib/metricEngine/publicCapital";
import {
  computeLaborForce,
  annualizedGrowthRate,
  potentialGrowth,
  tfpBasket,
  NEUTRAL_LABOR_PARTICIPATION,
} from "@/lib/metricEngine/potentialGrowth";
import { advanceOutputGap } from "@/lib/metricEngine/outputGap";
import {
  advanceOutputTrend,
  blendToMeasured,
  realOutputBlendWeight,
  resolveRealOutputStartTurn,
  seedOutputTrend,
  type OutputTrendState,
} from "@/lib/metricEngine/outputTrend";
import { applySectorBlend, convergenceBonus } from "@/lib/metricEngine/convergence";

import { getEraMonetaryBaseline } from "@/lib/constants/monetaryEra";
import {
  computeLabourTightness,
  nextLabourParticipationBonus,
  roundTightness,
} from "@/lib/labour/labourMarket";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import type { CountryId } from "@/lib/constants/countries";

import { fiscalMirrorFields } from "@/lib/metricEngine/fiscalMirror";
import { isMacroMetricPath } from "@/lib/macroMetrics/paths";

import { settleCapacityObligations } from "@/lib/livingConflict/capacityDestruction";
import {
  foldCapacityLedger,
  repairProgress,
  repairedCapitalAt,
} from "@/lib/livingConflict/rules/capacityDestruction";

import type { SectorRevenueTaxPayload } from "@/lib/metricEngine/registry/economic";
import type { NodeId } from "@/lib/metricEngine/types";

import {
  cabinetMacroTargetNudges,
  cabinetProductionPressure,
} from "@/lib/resetCabinet/rules/gameplay";

import {
  crisisEconomicExposure,
  crisisParticipationMultiplier,
  crisisPotentialGrowthPenalty,
} from "@/lib/livingConflict/rules/economicExposure";

import { automationPolicyFor } from "@/lib/automationPolicy/policies";
import { NO_SOCIETY_LAWS } from "@/lib/societyPressures/rules/laws";
import {
  advanceRegionSocietyPressures,
  type SocietyPressureState,
} from "@/lib/societyPressures/rules/region";
import { fundingResponse } from "@/lib/metricEngine/spendingChannel";
import { EDU_SPEND_HALF_SAT } from "@/lib/metricEngine/registry/education";

import { statesCollection } from "@/lib/db/repositories/states";

import { macroMetricsCollection } from "@/lib/db/repositories/macroMetrics";

import type { RunMetricEngineStageContext } from "@/lib/metricEngine/phase";

export async function settleMetricStates(context: RunMetricEngineStageContext): Promise<number> {
  for (const state of context.realStates) {
    const countryId = state.countryId;
    const countryMacro = context.macroInputs.byCountry.get(countryId);
    const ownedForState = context.sectorTax.ownedByState.get(state._id) ?? [];
    // P2/D7: prior realized-revenue baseline + how many turns ago it was taken.
    // Only meaningful under plants; the node ignores both fields otherwise.
    // Once the snapshot is tagged `host`, compare host-currency
    // sums so FX restatement cannot annualize into a per-turn GDP jig. Untagged
    // (legacy ₳) snapshots keep the ₳ path for one turn, then we rewrite as host.
    const prevRealized = (0, context.finite)(state.sectorRealizedRevenue);
    const prevRealizedTurn = (0, context.finite)(state.sectorRealizedRevenueTurn);
    const useHostRealized = state.sectorRealizedRevenueUnit === "host";
    const nowHost = sumHostRealizedRevenue(ownedForState);
    const nowAnchor = sumRealizedRevenue(ownedForState, context.sectorTax.plantsEnabled);
    // Trailing revenue trend (host currency only, so FX cannot leak into it —
    // same rule as the one-turn snapshot). On the legacy→host
    // flip turn the EMA seeds fresh from this turn's host sum and the snapshot
    // log restarts; until a snapshot matures past the minimum span the node
    // keeps using the one-turn fallback.
    const startsHostTrend = context.sectorTax.plantsEnabled && !useHostRealized;
    const trendActive = context.sectorTax.plantsEnabled;
    const revenueEmaNow = trendActive
      ? advanceRevenueEma(
          startsHostTrend ? undefined : (0, context.finite)(state.sectorRevenueEma),
          nowHost
        )
      : undefined;
    const priorSnapshots =
      trendActive && !startsHostTrend ? state.sectorRevenueSnapshots : undefined;
    const revenueTrendBaseline = trendActive
      ? selectRevenueTrendBaseline(priorSnapshots, context.turn)
      : null;
    const nextSnapshots =
      trendActive && revenueEmaNow !== undefined
        ? updateRevenueSnapshots(priorSnapshots, context.turn, revenueEmaNow)
        : undefined;
    // Keep physical history separate: comparing a new volume level with an old
    // money snapshot would create an artificial recession or boom at migration.
    const outputNow = trendActive ? sumObservedOutput(ownedForState) : null;
    const outputEmaNow =
      outputNow !== null
        ? advanceRevenueEma((0, context.finite)(state.sectorOutputEma), outputNow)
        : undefined;
    const outputTrendBaseline =
      outputEmaNow !== undefined
        ? selectRevenueTrendBaseline(state.sectorOutputSnapshots, context.turn)
        : null;
    const outputSnapshots =
      outputEmaNow !== undefined
        ? updateRevenueSnapshots(state.sectorOutputSnapshots, context.turn, outputEmaNow)
        : undefined;
    const payload: SectorRevenueTaxPayload = {
      owned: ownedForState,
      plantsEnabled: context.sectorTax.plantsEnabled,
      realizedRevenueNow: useHostRealized ? nowHost : nowAnchor,
      realizedRevenuePrev: prevRealized,
      turnsSincePrev: prevRealizedTurn !== undefined ? context.turn - prevRealizedTurn : undefined,
      revenueEmaNow,
      revenueTrendBaseline,
      outputEmaNow,
      outputTrendBaseline,
      outputHistorySpanTurns: outputHistorySpanTurns(state.sectorOutputSnapshots, context.turn),
      background: context.sectorTax.backgroundByState.get(state._id) ?? [],
      federalSalesTax:
        context.sectorTax.federalSalesTaxByCountry.get(countryId) ??
        getNeutralFederalSalesTaxRate(countryId),
      stateSalesTax:
        context.sectorTax.stateSalesTaxByState.get(state._id) ??
        getNeutralStateSalesTaxRate(countryId),
      countryId,
      // §6.1 (P7b): the country's LAGGED NATIONAL model (economic models are national
      // only — every region inherits its nation's model). This turn's classification
      // runs AFTER the engine, so the stored value is last turn's — the §7 lag.
      model: context.prevDocById.get(getNationalDocId(countryId) ?? "")?.economicModel,
    };

    // Advance the Solow capital stock off THIS turn's REAL output level (pre-compound
    // state.gdp deflated, millions — same unit as K). Cold-start seeds K ≈ 3×gdp (P1c-0).
    const output = (0, context.realGdpOf)(state);
    const priceIndexNow = context.priceIndexBefore.get(countryId);
    const capital = state.capitalStock ?? seedCapitalStock(output);
    // O1c (design §5): fold THIS turn's paid corp growth cost into investment,
    // capped at 5% of region GDP/yr. Only when the write is from this turn
    // (fresh-or-zero). ₳ → local-millions via the country's FX.
    let corpInvestPerTurn = 0;
    if (state.corpGrowthInvestmentTurn === context.turn) {
      const anchor = state.corpGrowthInvestmentAnchor ?? 0;
      const currency = COUNTRY_CURRENCY_MAP[countryId as keyof typeof COUNTRY_CURRENCY_MAP];
      const fx = currency ? (context.fxByCurrency.get(currency) ?? 1) : 1;
      const localMillions = (anchor * fx) / 1_000_000;
      corpInvestPerTurn = Math.max(0, toRealOutput(localMillions, priceIndexNow));
    }
    const additionalCapitalPerTurn = combineAdditionalCapitalInvestment({
      outputAnnualLocalMillions: output,
      publicCapitalBudgetAnnualLocalMillions: countryMacro
        ? toRealOutput(
            context.spendingRollup.publicCapitalAnnualLocalMillionsByRegion.get(state._id) ?? 0,
            priceIndexNow
          )
        : 0,
      corporateInvestmentPerTurnLocalMillions: corpInvestPerTurn,
      ownPcAnchor: countryMacro?.ownPcAnchor ?? 0,
      frontierPcAnchor: context.macroInputs.frontierPcAnchor,
      turnsPerYear: TURNS_PER_YEAR,
    });
    const capStep = advanceCapitalStock(
      capital,
      output,
      (0, context.primeRateFor)(countryId),
      TURNS_PER_YEAR,
      additionalCapitalPerTurn,
      // The country's OWN neutral rate, so "tight money" is judged relative to
      // that economy rather than a global 3. Administered-rate economies sit
      // structurally above 3 and were otherwise scored as permanently tight,
      // depreciating their capital stock every turn.
      getEraMonetaryBaseline(countryId as CountryId, context.eraYear)?.neutralPrimeRate
    );

    // Supply-side POTENTIAL growth (§5.1): αL·g_L + αK·g_K + TFP. Computed BEFORE
    // the registry so it can be threaded to the gdpGrowth/unemployment nodes.
    const priorMetricDoc = context.prevDocById.get(state._id);
    const crisisExposure = crisisEconomicExposure(
      context.armedConflicts,
      state,
      priorMetricDoc?.livingConflictExposure,
      context.turn
    );
    const participationDemandBonus = nextLabourParticipationBonus(
      (0, context.readMetricPath)(priorMetricDoc, "economic.labourTightness", "value"),
      (0, context.readMetricPath)(
        priorMetricDoc,
        "economic.labourParticipationDemandBonus",
        "value"
      )
    );
    const effectiveLaborParticipation =
      Math.min(
        100,
        (context.laborParticipationByState.get(state._id) ?? NEUTRAL_LABOR_PARTICIPATION) +
          participationDemandBonus +
          (context.employmentPolicies.get(state._id)?.participationBonus ?? 0)
      ) * crisisParticipationMultiplier(crisisExposure);
    const laborForce = computeLaborForce(
      state.workingAgePopulation ?? 0,
      state.militaryServicePopulation ?? 0,
      effectiveLaborParticipation
    );
    // The corporation phase has already written this turn's desired demand,
    // while leaving the previous tightness untouched for staffing decisions.
    // Reconcile the ratio here against the labor force just computed from this
    // turn's metric inputs, avoiding a current-demand / prior-supply mismatch.
    const hasCurrentLabourDemand = priorMetricDoc?.economic?.labourDemandTurn === context.turn;
    const currentDemand = (0, context.readMetricPath)(
      priorMetricDoc,
      "economic.labourDemand",
      "value"
    );
    const currentLabourTightness =
      hasCurrentLabourDemand && currentDemand !== undefined
        ? computeLabourTightness(currentDemand, laborForce)
        : undefined;
    const gL = annualizedGrowthRate(
      laborForce,
      context.prevLaborForce.get(state._id) ?? laborForce,
      TURNS_PER_YEAR
    );
    // Living TFP (P2d): R&D + skill + transport + saturating agglomeration from
    // the PREV turn's metrics (the C3 lag). Missing inputs → reference (1.2).
    const prevDocForTfp = context.prevDocById.get(state._id);
    // Bridge A: these four paths are demolished for playable regions, so resolve
    // them from the political board first. `?? undefined` is required, not
    // cosmetic — legacyUnit returns `number | null` while TfpBasketInputs fields
    // are `number | undefined`, and a null would bypass the basket's own orRef()
    // reference fallback. economic.rdIntensity and population.urbanizationRate
    // are macroMetrics survivors present for every country, so they stay on the
    // direct read.
    const tfpPath = (path: string): number | undefined =>
      context.politicalInputs.legacyUnit(state._id, path) ??
      (0, context.readMetricPath)(prevDocForTfp, path, "value") ??
      undefined;
    const tfp = tfpBasket({
      rdIntensity: (0, context.readMetricPath)(prevDocForTfp, "economic.rdIntensity", "value"),
      workforceSkill: tfpPath("education.workforceSkill"),
      transportEfficiency: tfpPath("infrastructure.transportEfficiency"),
      broadbandAccess: tfpPath("infrastructure.broadbandAccess"),
      powerGridReliability: tfpPath("infrastructure.powerGridReliability"),
      urbanizationRate: (0, context.readMetricPath)(
        prevDocForTfp,
        "population.urbanizationRate",
        "value"
      ),
    });
    const cabinetEffects = context.politicalInputs.cabinetEffects?.(state._id, countryId) ?? [];
    const basePotential =
      potentialGrowth(gL, capStep.annualizedGrowth, tfp) +
      cabinetProductionPressure(cabinetEffects);
    // Macro-growth v1 (design §4): add the convergence bonus (O2) OUTSIDE the TFP
    // clamp, then blend the LAGGED sector signal (O3). frontierPc = live max
    // across countries.
    let potential = basePotential;
    // Playable economies only (cm present ⇒ has a national doc + gdp/pop). O2
    // then O3, both scoped the same way so a latent region gets neither.
    if (countryMacro) {
      potential =
        basePotential +
        convergenceBonus(
          countryMacro.ownPcAnchor,
          context.macroInputs.frontierPcAnchor,
          countryMacro.openness
        );
      const sectorLagged = context.prevSectorValue.get(state._id);
      if (sectorLagged !== undefined) {
        potential = applySectorBlend(potential, sectorLagged);
      }
    }
    // Institutional failure lowers the economy's annual supply-side growth
    // ceiling. The output-gap path then carries that drag into realized GDP,
    // unemployment, tax bases, and every downstream macro consumer.
    potential -= context.democraticHealthDragByCountry.get(countryId) ?? 0;
    potential -= crisisPotentialGrowthPenalty(crisisExposure);
    // Measured-growth cutover (outputTrend.ts). Before the region's first run
    // on the measured headline, state.outputGap still holds the legacy
    // potential-anchored gap; afterwards that series lives in legacyOutputGap
    // only for as long as the blend needs it.
    const hasTrend = typeof state.outputTrendGrowth === "number";
    const realOutputStartTurn = resolveRealOutputStartTurn(
      state.realOutputStartTurn,
      typeof state.outputGap === "number" || typeof state.legacyOutputGap === "number",
      context.turn
    );
    const blendWeight = realOutputBlendWeight(context.turn, realOutputStartTurn);
    const prevGap = (hasTrend ? state.legacyOutputGap : state.outputGap) ?? 0;
    const prevTrend: OutputTrendState = hasTrend
      ? { gap: state.outputGap ?? 0, trendGrowth: state.outputTrendGrowth as number }
      : seedOutputTrend(context.prevSectorValue.get(state._id) ?? potential);
    // Okun's and migration's reference: the measured trend growth, blended
    // from the legacy potential across the cutover so neither jumps.
    const trendGrowthRef = blendToMeasured(potential, prevTrend.trendGrowth, blendWeight);

    // Prev feeds the SECTOR node's EMA + policy delta (P1c-2). `potential` and the
    // prior output gap are threaded to the gdpGrowth/unemployment nodes via
    // seedCurrent (they are not registry nodes).
    const prevValue: Record<NodeId, number> = {};
    const prevSimBaseline: Record<NodeId, number> = {};
    const policyValues: Record<NodeId, number> = {};

    const sectorVal = context.prevSectorValue.get(state._id);
    if (sectorVal !== undefined) {
      prevValue["economic.sectorGrowth"] = sectorVal;
      policyValues["economic.sectorGrowth"] = sectorVal; // delta numerator
    }
    const sectorBase = context.prevSectorBaseline.get(state._id);
    if (sectorBase !== undefined) prevSimBaseline["economic.sectorGrowth"] = sectorBase;

    // Unemployment is a value-EMA: feed the prior VALUE (defaulted to 4.5) as its
    // simBaseline; used for BOTH the Okun target and the EMA blend.
    const unempVal = context.prevUnemployment.get(state._id) ?? context.DEFAULT_UNEMPLOYMENT;
    prevSimBaseline["economic.unemploymentRate"] = unempVal;
    prevValue["economic.unemploymentRate"] = unempVal;

    // Generic nodes (P2+): registry-derived wiring. The stored value is BOTH the
    // prev and the policyValue (processStateMetrics already ran this turn);
    // simBaseline comes from the node's own prior write. Missing either →
    // evalNode's cold-start fallbacks make the first live turn write back the
    // stored value exactly (parity by construction).
    const prevDoc = context.prevDocById.get(state._id);
    const seedCurrent: Record<NodeId, number> = {
      "economic.potentialGrowth": potential,
      "economic.outputGapPrev": prevGap,
      "economic.realOutputBlendWeight": blendWeight,
      "economic.trendGrowth": trendGrowthRef,
    };
    for (const n of context.GENERIC_NODES) {
      const v = (0, context.readMetricPath)(prevDoc, n.id, "value");
      if (v !== undefined) {
        prevValue[n.id] = v;
        policyValues[n.id] = v;
      }
      const b = (0, context.readMetricPath)(prevDoc, n.id, "simBaseline");
      if (b !== undefined) prevSimBaseline[n.id] = b;
    }
    for (const id of context.GENERIC_LAGGED_IDS) {
      const v = (0, context.readMetricPath)(prevDoc, id, "value");
      if (v !== undefined) prevValue[id] = v;
    }
    for (const id of context.GENERIC_SEED_IDS) {
      const v = (0, context.readMetricPath)(prevDoc, id, "value");
      if (v !== undefined) seedCurrent[id] = v;
    }
    // Political inputs come from the BOARD now, in legacy units. `legacyUnit`
    // first because Bridge A's bands are derived from each consuming engine's
    // own neutral, so a score of 50 reproduces that engine's prior behaviour
    // exactly; `legacyValue` is the generic inverse of the derivation and
    // covers the paths Bridge A has no authored band for. A path resolving to
    // neither is left absent, and the node's own `??` fallback applies — the
    // same treatment a missing stored value always got.
    for (const id of context.POLITICAL_INPUT_IDS) {
      const v =
        context.politicalInputs.legacyUnit(state._id, id) ??
        context.politicalInputs.legacyValue(state._id, id);
      if (v != null && Number.isFinite(v)) {
        seedCurrent[id] = v;
        // The political board has already advanced using the preceding macro
        // readings. Feed that predetermined snapshot to external lagged edges,
        // rather than falling back to constants in retired macro categories.
        if (context.genericLaggedIds.has(id)) prevValue[id] = v;
      }
    }
    // Labour wage-index delta feeds medianIncome and unemployment.
    const wageDelta = (0, context.readMetricPath)(
      prevDoc,
      "economic.labourWageIndexDelta",
      "value"
    );
    if (wageDelta !== undefined) seedCurrent["economic.labourWageIndexDelta"] = wageDelta;
    // v2-3b: automation half of the jobs channel — unemploymentNode only.
    const automationDelta = (0, context.readMetricPath)(
      prevDoc,
      "economic.automationIndexDelta",
      "value"
    );
    if (automationDelta !== undefined) {
      seedCurrent["economic.automationIndexDelta"] = automationDelta;
    }
    // Use a same-turn demand-over-supply reading when the corporation
    // phase produced a fresh demand snapshot. If corporations were paused,
    // retain the last measured tightness rather than pairing stale demand
    // with today's labor force. Corporate staffing uses the previous turn's
    // ratio, so no same-turn feedback loop is introduced.
    const tightness = hasCurrentLabourDemand
      ? currentLabourTightness
      : (0, context.readMetricPath)(prevDoc, "economic.labourTightness", "value");
    if (tightness !== undefined) seedCurrent["economic.labourTightness"] = tightness;

    // §6.3 (P7b): the country's LAGGED economic model nudges its synergy metrics'
    // targets (node targets only; resolved to node ids). Parity-neutral when no
    // named model / mixed (empty map → all nudges default to 0 in evalNode).
    const nationalDocId = getNationalDocId(countryId);
    const countryModel = nationalDocId
      ? context.prevDocById.get(nationalDocId)?.economicModel
      : undefined;
    let cachedNudges = context.targetNudgesByCountry.get(countryId);
    if (!cachedNudges) {
      cachedNudges = {};
      for (const [metricId, nudge] of synergyNudges(countryModel)) {
        const nodeId = context.nodeIdByMetricId.get(metricId);
        if (nodeId) cachedNudges[nodeId] = nudge;
      }
      // Fold in active org-directive + alliance-posture nudges for this state's
      // country (added to any economic-model synergy already targeting the node).
      for (const byCountry of [
        context.directiveNudgesByCountry,
        context.postureNudgesByCountry,
        context.agencyNudgesByCountry,
      ]) {
        const nudges = byCountry.get(countryId);
        if (!nudges) continue;
        for (const [metricId, delta] of nudges) {
          const nodeId = context.nodeIdByMetricId.get(metricId);
          if (nodeId) cachedNudges[nodeId] = (cachedNudges[nodeId] ?? 0) + delta;
        }
      }
      const bankFailure = context.bankFailureEffects.get(countryId);
      if (bankFailure) {
        const nodeId = "economic.consumerConfidence";
        cachedNudges[nodeId] = (cachedNudges[nodeId] ?? 0) + bankFailure.consumerConfidence;
      }
      context.targetNudgesByCountry.set(countryId, cachedNudges);
    }
    // Fresh copy per state: downstream consumers must not share mutable state.
    const targetNudges: Record<NodeId, number> = { ...cachedNudges };
    for (const [nodeId, nudge] of Object.entries(cabinetMacroTargetNudges(cabinetEffects))) {
      targetNudges[nodeId] = (targetNudges[nodeId] ?? 0) + nudge;
    }

    // §6.4 (P7b): coherent (signature-category) spending goes further under a
    // held model. Scale the per-capita rollup before nodes consume it via
    // {spending}. Parity-neutral when no named model / mixed (returns the same map).
    const spending = applySpendingEfficiency(
      context.spendingRollup.perCapitaByRegion.get(state._id) ?? {},
      countryModel
    );

    // Era envelopes per node for this state's country (null year ⇒ empty map ⇒
    // no clamps). Only enveloped catalog metrics get an entry.
    let cachedEnvelopes = context.envelopesByCountry.get(countryId);
    if (!cachedEnvelopes) {
      cachedEnvelopes = {};
      if (context.eraYear != null) {
        for (const n of context.MACRO_NODES) {
          const env = getEraEnvelope(n.metricId, countryId, context.eraYear);
          if (env) cachedEnvelopes[n.id] = env;
        }
      }
      context.envelopesByCountry.set(countryId, cachedEnvelopes);
    }
    const envelopes = { ...cachedEnvelopes };

    // 2027 world: education, automation absorption and housing for this region.
    // Housing pressure moves the cost of living target; absorbed workers become
    // background labour demand in the employment step below.
    const society = context.societyOn
      ? advanceRegionSocietyPressures({
          turn: context.turn,
          turnsPerYear: TURNS_PER_YEAR,
          countryId,
          previous: priorMetricDoc?.societyPressure,
          adults: state.votingEligiblePopulation ?? (state.population ?? 0) * 0.78,
          automationDisplaced: hasCurrentLabourDemand
            ? ((0, context.readMetricPath)(
                priorMetricDoc,
                "economic.automationDisplaced",
                "value"
              ) ?? 0)
            : undefined,
          supplyGrowthPct:
            (0, context.readMetricPath)(prevDoc, "social.housingSupplyGrowth", "value") ??
            context.politicalInputs.legacyValue(state._id, "social.housingSupplyGrowth") ??
            undefined,
          universityEnrollment:
            (0, context.readMetricPath)(prevDoc, "education.universityEnrollment", "value") ??
            context.politicalInputs.legacyValue(state._id, "education.universityEnrollment") ??
            undefined,
          educationSpendingResponse: fundingResponse(
            spending.education ?? 0,
            EDU_SPEND_HALF_SAT,
            100
          ),
          outputGap: hasTrend ? state.outputGap : 0,
          laws: context.societyLaws.get(countryId) ?? NO_SOCIETY_LAWS,
          automation: automationPolicyFor(context.automationPolicies, countryId),
        })
      : undefined;
    if (society) {
      targetNudges["economic.costOfLiving"] =
        (targetNudges["economic.costOfLiving"] ?? 0) + society.costOfLivingNudge;
    }

    const registry =
      resetSystemVersionsForCountry(context.eraGameState, RESET_V2_READY, countryId).cabinet ===
      "v2"
        ? context.CABINET_V2_MACRO_NODES
        : context.MACRO_NODES;
    const employment =
      laborForce > 0
        ? advanceEmployment({
            turn: context.turn,
            turnsPerYear: TURNS_PER_YEAR,
            laborForce,
            unemployment: unempVal,
            initialLaborForce: context.prevLaborForce.get(state._id),
            corporateDemand: hasCurrentLabourDemand ? currentDemand : undefined,
            matchingFriction:
              ((0, context.readMetricPath)(prevDoc, "economic.matchingFriction", "value") ?? 4.5) +
              (targetNudges["economic.unemploymentRate"] ?? 0),
            workforceSkill:
              context.politicalInputs.score(state._id, "education.adultSkills") ??
              tfpPath("education.workforceSkill"),
            outputGap: hasTrend ? state.outputGap : 0,
            medianIncome: (0, context.readMetricPath)(prevDoc, "economic.medianIncome", "value"),
            policy: context.employmentPolicies.get(state._id),
            absorbedJobs: society?.absorbedJobs,
            previous: prevDoc?.labourEmployment,
          })
        : undefined;
    // Existing cabinet/model effects influence desired employment, not an
    // extra point adjustment after counts have already determined the rate.
    if (employment) delete targetNudges["economic.unemploymentRate"];
    const results = evaluateRegistry(registry, {
      stateId: state._id,
      countryId,
      prev: prevValue,
      prevSimBaseline,
      providers: {
        povertyPolicy: context.povertyPolicies.get(state._id),
        regionalEmployment: employment,
        sectorRevenueTax: payload,
        // National approval applied to every state of the country (a regional
        // approval variant is a named future refinement). Missing doc → 45.
        governmentApproval: context.approvalByCountry.get(countryId) ?? 45,
        // Dynamic fiscal-growth inputs for wageGrowth/tradeGrowth (per country;
        // the nodes' own ?? fallbacks cover a missing budget doc).
        fiscalTradeInputs: context.fiscalTradeInputsByCountry.get(countryId),
        // Undefined for a country at peace; the consuming nodes read that as zero.
        warDamage: context.warDamageByCountryId.get(countryId),
      },
      spending,
      policyValues,
      seedCurrent,
      targetNudges,
      envelopes,
    });

    const sectorSignal = results["economic.sectorGrowth"].value;
    const integratedGdp = results["economic.gdpGrowth"].value;
    // The legacy gap only advances while the blend still reads it.
    const legacyGapStep =
      blendWeight < 1 ? advanceOutputGap(prevGap, sectorSignal, potential, TURNS_PER_YEAR) : null;
    // The measured gap tracks the physical signal, not the blended headline, so
    // the cutover itself opens no gap.
    const trendStep = advanceOutputTrend(prevTrend, sectorSignal, TURNS_PER_YEAR);

    // Headline = measured real output growth (blended across the cutover).
    // gdpGrowth keeps its approval term + metricDefinitions entry; the sector
    // signal, potentialGrowth, trendGrowth and laborForce are surfaced
    // intermediates, all approval-excluded.
    const setFields: Record<string, number | Date> = {
      "economic.gdpGrowth.value": integratedGdp,
      "economic.trendGrowth.value": trendGrowthRef,
      "economic.sectorGrowth.value": sectorSignal,
      "economic.sectorGrowth.simBaseline": results["economic.sectorGrowth"].simBaseline,
      "economic.unemploymentRate.value": results["economic.unemploymentRate"].value,
      "economic.potentialGrowth.value": potential,
      "economic.laborForce.value": laborForce,
      "economic.labourParticipationDemandBonus.value": participationDemandBonus,
      ...(hasCurrentLabourDemand && currentLabourTightness !== undefined
        ? { "economic.labourTightness.value": roundTightness(currentLabourTightness) }
        : {}),
      lastUpdated: context.now,
    };
    const persistCrisisExposure =
      priorMetricDoc?.livingConflictExposure ||
      crisisExposure.displacedShare > 0 ||
      crisisExposure.hostingShare > 0 ||
      crisisExposure.infrastructureDamage > 0;
    // Generic nodes (P2+): persist value + simBaseline per node — but ONLY for
    // metrics the region already stores. Approval scores every metric PRESENT
    // (audit-5), so persisting a node a region never had (e.g. UK-only
    // gcseAttainment on a US doc) would INTRODUCE a new approval term and
    // shift approval. Country scoping falls out of seed presence naturally.
    for (const n of context.GENERIC_NODES) {
      const r = results[n.id];
      if (!r) continue;
      const prevVal = (0, context.readMetricPath)(prevDoc, n.id, "value");
      if (prevVal === undefined) continue;
      setFields[`${n.id}.value`] = r.value;
      setFields[`${n.id}.simBaseline`] = r.simBaseline;
      // Persist the per-turn delta so the UI's rate-of-change / TrendChip
      // has data for every engine-animated metric. Previously only
      // independenceDesire wrote a `trend`, so every other metric rendered
      // "flat" regardless of actual movement (the reported "rate of change is
      // not shown"). Convention matches independenceDesireDrift: raw value delta.
      setFields[`${n.id}.trend`] = r.value - prevVal;
    }

    // 📊 budget-sync (exact mirror): fiscal-readout metrics equal the real ratio
    // this turn, scoped by the persist gate — only where the region already stores
    // them (keeps schuldenbremse to 2019-era presets, ratios to budgeted
    // countries). No simBaseline: these are not coexistence nodes.
    Object.assign(
      setFields,
      fiscalMirrorFields(
        context.fiscalRatiosByCountry.get(countryId),
        (id) => (0, context.readMetricPath)(prevDoc, id, "value") !== undefined
      )
    );

    // Macro only. Every node evaluated above is a macro node, so the filter is
    // a guard rather than a router: a political path reaching it would mean
    // something is trying to persist a board metric into the macro doc.
    const macroSet: Record<
      string,
      number | Date | EmploymentState | ProductivityState | SocietyPressureState
    > = {};
    for (const [key, value] of Object.entries(setFields)) {
      if (key === "lastUpdated") continue;
      if (isMacroMetricPath(key)) macroSet[key] = value;
    }
    if (Object.keys(macroSet).length > 0) {
      if (employment) macroSet.labourEmployment = employment.state;
      if (society) {
        macroSet.societyPressure = society.state;
        macroSet["population.housingPressure.value"] =
          Math.round(society.state.housingPressure * 10) / 10;
        macroSet["population.tertiaryAttainment.value"] =
          Math.round(society.state.educationIndex * 10) / 10;
      }
      if (persistCrisisExposure) {
        for (const [key, value] of Object.entries(crisisExposure))
          macroSet[`livingConflictExposure.${key}`] = value;
      }
      macroSet.lastUpdated = context.now;
      context.macroOps.push({
        updateOne: {
          filter: { _id: state._id },
          update: {
            $set: macroSet,
            ...(hasCurrentLabourDemand && currentLabourTightness === undefined
              ? { $unset: { "economic.labourTightness.value": "" as const } }
              : {}),
          },
        },
      });
    }

    // Compound the region's GDP LEVEL by the INTEGRATED gdpGrowth this turn (exact
    // per-turn form). state.gdp is the SSOT (millions); national GDP = Σ state.gdp.
    const compoundedGdp = compoundGdpLevel(output, integratedGdp, TURNS_PER_YEAR);
    // Conflict destruction and its budget-funded repair move the stock once; the
    // applied ledger is written with the stock so a replayed turn changes nothing.
    const capacityEntries = context.capacityByRegion.get(state._id) ?? [];
    const capacityFold =
      capacityEntries.length > 0
        ? foldCapacityLedger({
            capitalStock: capStep.capital,
            gdp: compoundedGdp,
            entries: capacityEntries.map((obligation) => ({
              id: obligation._id,
              destroyedCapital: obligation.destroyedCapital,
              fundedCapital: repairedCapitalAt(obligation, context.turn),
            })),
            applied: state.conflictCapacityApplied,
          })
        : null;
    if (capacityFold) {
      // The last installment turn is still charged to the budget, so an
      // obligation is retired only on the turn after its repair completes.
      for (const obligation of capacityEntries) {
        if (
          capacityFold.settledIds.includes(obligation._id) &&
          repairProgress(obligation, context.turn) >= 1 &&
          context.turn > obligation.createdTurn + obligation.repairTurns
        )
          context.settledCapacityIds.push(obligation._id);
      }
    }
    const newGdp = capacityFold?.gdp ?? compoundedGdp;
    const newNominalGdp = toNominalOutput(newGdp, context.priceIndexAfter.get(countryId));
    context.nominalGdpByCountry.set(
      countryId,
      (context.nominalGdpByCountry.get(countryId) ?? 0) + newNominalGdp
    );
    if (employment)
      macroSet.labourProductivity = advanceProductivity({
        previous: prevDoc?.labourProductivity,
        turn: context.turn,
        output: newGdp,
        employed: employment.state.corporateEmployed + employment.state.backgroundEmployed,
        employmentTurn: employment.state.lastTurn,
        countryId,
      });
    context.stateOps.push({
      updateOne: {
        filter: { _id: state._id },
        update: {
          $set: {
            gdp: newNominalGdp,
            capitalStock: capacityFold?.capitalStock ?? capStep.capital,
            ...(capacityFold ? { conflictCapacityApplied: capacityFold.applied } : {}),
            outputGap: trendStep.gap,
            outputTrendGrowth: trendStep.trendGrowth,
            realOutputStartTurn,
            ...(legacyGapStep ? { legacyOutputGap: legacyGapStep.gap } : {}),
            // Snapshot THIS turn's realized owned-sector revenue as next turn's
            // baseline, in every mode so a flip to plants has a one-turn-old baseline.
            // BASIS stays plants-gated: below plants it is the nameplate sum, so
            // non-plants worlds see no level shift. Under plants the snapshot is HOST
            // currency so next turn's ratio is FX-invariant.
            sectorRealizedRevenue: context.sectorTax.plantsEnabled
              ? nowHost
              : sumRealizedRevenue(ownedForState, false),
            sectorRealizedRevenueTurn: context.turn,
            ...(context.sectorTax.plantsEnabled
              ? { sectorRealizedRevenueUnit: "host" as const }
              : {}),
            // Trailing-trend state (host-tagged plants worlds only). The first
            // plants turn is unit-untagged, so this starts one turn later with
            // a clean host-only series.
            ...(outputEmaNow !== undefined ? { sectorOutputEma: outputEmaNow } : {}),
            ...(outputSnapshots !== undefined ? { sectorOutputSnapshots: outputSnapshots } : {}),
            ...(revenueEmaNow !== undefined ? { sectorRevenueEma: revenueEmaNow } : {}),
            ...(nextSnapshots !== undefined ? { sectorRevenueSnapshots: nextSnapshots } : {}),
          },
          // Dropping below plants returns the stored one-turn baseline to the
          // legacy unit. Remove the host tag and trend state so a later flip
          // starts a fresh host-only EMA and snapshot log on that exact turn.
          ...(!context.sectorTax.plantsEnabled || outputEmaNow === undefined
            ? {
                $unset: {
                  sectorOutputEma: "" as const,
                  sectorOutputSnapshots: "" as const,
                  ...(!context.sectorTax.plantsEnabled
                    ? {
                        sectorRealizedRevenueUnit: "" as const,
                        sectorRevenueEma: "" as const,
                        sectorRevenueSnapshots: "" as const,
                      }
                    : {}),
                },
              }
            : {}),
        },
      },
    });
  }

  if (context.macroOps.length > 0) {
    await macroMetricsCollection(context.db).bulkWrite(context.macroOps);
  }
  if (context.stateOps.length > 0) {
    await statesCollection(context.db).bulkWrite(context.stateOps);
  }
  await settleCapacityObligations(context.db, context.settledCapacityIds);
  await (0, context.advanceBudgetGdpBasis)(context.db, {
    budgetIdByCountry: context.budgetIdByCountry,
    priceIndexAfter: context.priceIndexAfter,
    smoothedGdpBefore: context.smoothedGdpBefore,
    nominalGdpMillionsByCountry: context.nominalGdpByCountry,
  });
  return context.realStates.length;
}
