import { settleMetricStates } from "@/lib/metricEngine/settleMetricStates";
import { loadBankFailureEffects } from "@/lib/banking/failurePolitics";
import { type ProductivityState } from "@/lib/resetMetrics/rules/productivity";
import { loadEmploymentPolicies } from "@/lib/labour/employmentPolicies";
import { type EmploymentState } from "@/lib/labour/rules/employment";
import { RESET_V2_READY } from "@/lib/resetVersions/availability";
import { resetSystemVersionsForCountry } from "@/lib/resetVersions/rules";
import { cabinetMacroRegistry } from "@/lib/resetCabinet/rules/gameplay";

import type { AnyBulkWriteOperation, Db } from "mongodb";

import type { State } from "@/lib/db/types/state";
import type { FederalBudget } from "@/lib/db/types/budget";
import { getFederalBudgetCollection } from "@/lib/db/collections/federalBudget";

import { resolveGameYear } from "@/lib/era/era";
import { NATIONAL_SCOPE_IDS, getNationalDocId } from "@/lib/constants/nationalScope";

import { loadActiveDirectiveNudgesByCountry } from "@/lib/internationalOrganizations/directives";
import { loadActivePostureNudgesByCountry } from "@/lib/internationalOrganizations/posture";
import { loadActiveAgencyNudgesByCountry } from "@/lib/internationalOrganizations/agency";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { getCountryConfig } from "@/lib/constants/countries";
import { getBankId } from "@/lib/centralBank/helpers";
import { type RevenueSnapshot } from "@/lib/turn/gdpGrowth";

import {
  GDP_SMOOTHING_INERTIA,
  advancePriceIndex,
  resolvePriceIndex,
  smoothNationalGdpPerTurn,
  toRealOutput,
} from "./priceLevel";

import { buildMacroGrowthInputs, type CountryMacroRaw } from "./macroGrowthInputs";
import { loadValuationFxRates } from "@/lib/currency/corporationCapital";

import type { CountryId } from "@/lib/constants/countries";
import {
  governmentApprovalProvider,
  sectorRevenueTaxProvider,
  fiscalRatiosProvider,
  fiscalTradeInputsProvider,
  warDamageProvider,
} from "./providers";
import { FISCAL_MIRROR_METRICS } from "./fiscalMirror";
import { MACRO_CATEGORIES } from "@/lib/macroMetrics/paths";
import { spendingProvider } from "./spendingProvider";
import { loadPovertyPolicyInputs } from "./povertyProvider";
import { loadRepairingCapacityObligations } from "@/lib/livingConflict/capacityDestruction";

import type {
  ConflictCapacityApplied,
  ConflictCapacityObligation,
} from "@/lib/db/types/conflictCapacity";
import { METRIC_REGISTRY_SORTED } from "./registry";

import type { NodeId } from "./types";
import type { EconomicModelState } from "@/lib/constants/economicModels";
import { loadPoliticalMacroInputs } from "@/lib/politicalLegislation/politicalMacroInputs";

import {
  DEMOCRATIC_HEALTH_METRIC_IDS,
  scoreGovernanceStyle,
  supportsGovernanceStyle,
} from "@/lib/governanceStyle/score";
import { democraticHealthEconomicDrag } from "@/lib/governanceStyle/rules/democraticConsequences";
import { loadDemocraticCompetition } from "@/lib/governanceStyle/loadCompetition";
import type { LivingConflictState } from "@/lib/livingConflict/types";
import { type CrisisEconomicExposure } from "@/lib/livingConflict/rules/economicExposure";
import { loadSocietyLawPositions, presetUsesSocietyPressures } from "@/lib/societyPressures/shell";
import { loadAutomationPolicies } from "@/lib/automationPolicy/policies";
import { NO_SOCIETY_LAWS } from "@/lib/societyPressures/rules/laws";
import { type SocietyPressureState } from "@/lib/societyPressures/rules/region";

import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { statesCollection } from "@/lib/db/repositories/states";
import { countryGameStatesCollection } from "@/lib/db/repositories/countryGameStates";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { macroMetricsCollection } from "@/lib/db/repositories/macroMetrics";
import { livingConflictsCollection } from "@/lib/db/repositories/livingConflicts";

/** Default unemployment when a state has no prior reading (matches gdpGrowth.ts `?? 4.5`). */
const DEFAULT_UNEMPLOYMENT = 4.5;

// ── Generic node wiring (P2+) ────────────────────────────────────────────────
// The three P0/P1c economic nodes keep their bespoke wiring below (sector-signal
// fallback chain, Okun, stock writes). Every OTHER registry node is wired
// GENERICALLY from its declared inputs: prev value/simBaseline projected +
// fed per node, bare-string non-registry inputs fed as seedCurrent (their
// policy-adjusted stored value), {lagged} non-registry inputs fed as prev.
// Adding a category = registering its nodes; no phase edits (spec P0 promise).

const BESPOKE_NODE_IDS = new Set([
  "economic.sectorGrowth",
  "economic.gdpGrowth",
  "economic.unemploymentRate",
]);

/**
 * The engine animates MACRO categories only. Political nodes are still
 * evaluated but hold no stored value: they are pure target functions folded in
 * through the engine term (see politicalMetrics/engineNodes.ts). Persisting
 * them here would write a legacy value nothing reads into a retiring store.
 * Filtering a topologically sorted list keeps it sorted, so same-turn
 * dependencies still resolve in order.
 */
const MACRO_NODES = METRIC_REGISTRY_SORTED.filter((n) => MACRO_CATEGORIES.has(n.categoryId));
const CABINET_V2_MACRO_NODES = cabinetMacroRegistry(MACRO_NODES);

const GENERIC_NODES = MACRO_NODES.filter((n) => !BESPOKE_NODE_IDS.has(n.id));
const REGISTRY_IDS = new Set(MACRO_NODES.map((n) => n.id));

/**
 * Political metrics that MACRO nodes read (workforce skill, grid reliability,
 * crime, inequality...). They were registry nodes evaluated in the same pass;
 * now they are external inputs like any other, resolved from the region's
 * political board and fed through `seedCurrent`.
 *
 * Derived from the nodes' own declared inputs rather than hand-listed, so
 * adding an edge to a political metric cannot silently leave it undefined.
 */
const POLITICAL_INPUT_IDS: string[] = [
  ...new Set(
    MACRO_NODES.flatMap((n) =>
      n.inputs.map((i) => (typeof i === "string" ? i : "lagged" in i ? i.lagged : null))
    )
      .filter((id): id is string => id != null)
      .filter((id) => !MACRO_CATEGORIES.has(id.split(".")[0]))
  ),
];

// §6.3 (P7b): resolve a bare metricId (e.g. "militaryReadiness") to its node id
// (e.g. "governance.militaryReadiness") for synergy nudges. Root-only synergy
// targets (no node) are absent here and silently skipped — they are not engine-
// animated, so they receive no nudge until a root-animation pass lands.
const nodeIdByMetricId = new Map<string, NodeId>();
for (const n of METRIC_REGISTRY_SORTED) nodeIdByMetricId.set(n.metricId, n.id);

const genericSeedIds = new Set<string>();
const genericLaggedIds = new Set<string>();
for (const n of GENERIC_NODES) {
  for (const input of n.inputs) {
    if (typeof input === "string") {
      if (!REGISTRY_IDS.has(input)) genericSeedIds.add(input);
    } else if ("lagged" in input && !REGISTRY_IDS.has(input.lagged)) {
      genericLaggedIds.add(input.lagged);
    }
  }
}
const GENERIC_SEED_IDS = [...genericSeedIds];
const GENERIC_LAGGED_IDS = [...genericLaggedIds];

/** Mongo projection for the generic nodes' prevs + their external reads. */
const GENERIC_PROJECTION: Record<string, 1> = {};
for (const n of GENERIC_NODES) {
  GENERIC_PROJECTION[`${n.id}.value`] = 1;
  GENERIC_PROJECTION[`${n.id}.simBaseline`] = 1;
}
for (const id of [...GENERIC_SEED_IDS, ...GENERIC_LAGGED_IDS]) {
  GENERIC_PROJECTION[`${id}.value`] = 1;
}
// TFP basket inputs (P2d) not already projected as nodes/inputs: rdIntensity
// (R&D policy root) + urbanizationRate. workforceSkill/transportEfficiency are
// generic nodes and already projected above.
GENERIC_PROJECTION["economic.rdIntensity.value"] = 1;
GENERIC_PROJECTION["economic.industrialPolicyExecution.value"] = 1;
GENERIC_PROJECTION["population.urbanizationRate.value"] = 1;
// v2-2/v2-3: the corp turn's Δ-passthrough signals (medianIncomeNode +
// unemploymentNode read them manually, gated on labourMacroEnabled — see
// seedCurrent below — so neither is a declared node input, the same
// treatment as potentialGrowth/outputGapPrev).
GENERIC_PROJECTION["economic.labourWageIndexDelta.value"] = 1;
// v2-3b: automation half of the jobs channel (separate signal from the wage
// index — see its corp-turn accumulation site for why).
GENERIC_PROJECTION["economic.automationIndexDelta.value"] = 1;

/** Read `doc[cat][metric][field]` (dot id), rejecting non-finite values. */
function readMetricPath(
  doc: unknown,
  id: string,
  field: "value" | "simBaseline"
): number | undefined {
  const dot = id.indexOf(".");
  if (dot < 0 || doc == null) return undefined;
  const cat = id.slice(0, dot);
  const metric = id.slice(dot + 1);
  const v = (doc as Record<string, Record<string, Record<string, unknown>> | undefined>)[cat]?.[
    metric
  ]?.[field];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

interface PrevMetricsDoc {
  _id: string;
  labourEmployment?: EmploymentState;
  labourProductivity?: ProductivityState;
  /** 2027 world: automation absorption, housing stock and education index. */
  societyPressure?: SocietyPressureState;
  livingConflictExposure?: CrisisEconomicExposure;
  /** §6.1 (P7b): the region's LAGGED economic model, for sector GDP concentration. */
  economicModel?: EconomicModelState;
  economic?: {
    // The sector signal now bears the EMA + policy/tax coexistence (P1c-2). Read
    // its prev from sectorGrowth, falling back to the legacy gdpGrowth fields for
    // a seamless cutover from worlds seeded before the split.
    sectorGrowth?: { value?: number; simBaseline?: number };
    gdpGrowth?: { value?: number; simBaseline?: number; sectorBaseline?: number };
    unemploymentRate?: { value?: number };
    laborParticipation?: { value?: number };
    laborForce?: { value?: number };
    labourDemand?: { value?: number };
    labourDemandTurn?: number;
    automationDisplaced?: { value?: number };
  };
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Unified metric-engine turn phase. Replaces the standalone `gdpGrowth` phase:
 * runs cross-collection providers once, then evaluates the registry per real
 * state and persists with one bulkWrite. Behaviour-preserving for gdpGrowth +
 * unemployment (golden-master gated, R2). Skips NATIONAL_SCOPE synthetic docs.
 */
async function prepareRunMetricEngine(db: Db, turn: number) {
  // Era envelopes: live year for the metric era catalog's engine clamps.
  const eraGameState = await gameStateCollection<import("@/lib/db/types").GameState>(db).findOne(
    { _id: "current" },
    {
      projection: {
        currentYear: 1,
        currentTurn: 1,
        startingYear: 1,
        preset: 1,
        resetWorldId: 1,
        resetVersionSeeds: 1,
        metricsSystemVersion: 1,
        legislationSystemVersion: 1,
        cabinetSystemVersion: 1,
      },
    }
  );
  const eraYear = eraGameState ? resolveGameYear(eraGameState) : null;
  const armedConflicts = await livingConflictsCollection<LivingConflictState>(db)
    .find(
      {
        defKey: { $in: ["yugoslav_dissolution", "russia_ukraine_security", "arab_uprisings"] },
      },
      {
        projection: {
          defKey: 1,
          hasOpened: 1,
          status: 1,
          tracks: 1,
          representedActors: 1,
          arabRegional: 1,
          realizedInfrastructureDamage: 1,
        },
      }
    )
    .toArray();

  // SP5: prev values live in TWO stores post-split — macroMetrics carries
  // economic/population (+ economicModel) for every country; stateMetrics
  // carries the political categories for non-playables. Both are projected
  // with the same field list (absent fields project to nothing) and merged
  // per region below, so every downstream read keeps its single-doc shape.
  const PREV_PROJECTION = {
    labourEmployment: 1,
    labourProductivity: 1,
    "economic.matchingFriction.value": 1,
    livingConflictExposure: 1,
    economicModel: 1,
    "economic.sectorGrowth.value": 1,
    "economic.sectorGrowth.simBaseline": 1,
    "economic.gdpGrowth.value": 1,
    "economic.gdpGrowth.simBaseline": 1,
    "economic.gdpGrowth.sectorBaseline": 1,
    "economic.unemploymentRate.value": 1,
    "economic.laborParticipation.value": 1,
    "economic.laborForce.value": 1,
    "economic.labourDemand.value": 1,
    "economic.labourTightness.value": 1,
    "economic.labourParticipationDemandBonus.value": 1,
    "economic.labourDemandTurn": 1,
    // 2027 society pressures (absent in other worlds, so projecting is free).
    societyPressure: 1,
    "economic.automationDisplaced.value": 1,
    "social.housingSupplyGrowth.value": 1,
    "education.universityEnrollment.value": 1,
    // Generic nodes (P2+): prev value/simBaseline + external seed/lagged reads,
    // derived from the registry at module load.
    ...GENERIC_PROJECTION,
    // 📊 budget-sync: project the mirror metrics' value so the persist gate
    // (presence check) can scope which regions get the live ratio.
    ...Object.fromEntries(FISCAL_MIRROR_METRICS.map((m) => [`${m.id}.value`, 1] as const)),
  } as Record<string, 1>;

  const [
    allStates,
    prevMetrics,
    sectorTax,
    centralBanks,
    spendingRollup,
    approvalByCountry,
    fiscalRatiosByCountry,
    fiscalTradeInputsByCountry,
    labourConfig,
    politicalInputs,
    countryGameStates,
    warDamageByCountryId,
    capacityObligations,
  ] = await Promise.all([
    statesCollection(db).find({}).toArray(),
    macroMetricsCollection(db).find({}).project<PrevMetricsDoc>(PREV_PROJECTION).toArray(),
    sectorRevenueTaxProvider(db, turn),
    // Per-country prime rate drives capital investment (P1c-0). Batched here so
    // there is no per-region round trip.
    centralBanksCollection<{ _id: string; primeRate?: number }>(db).find({}).toArray(),
    // Per-region per-capita budget spend by category (P2 spending backbone). One
    // batched provider read; nodes consume it via {spending} inputs.
    spendingProvider(db),
    // P4: last turn's stored national approval per country (the approval phase
    // writes AFTER the engine — the lag that keeps the trust loop damped).
    governmentApprovalProvider(db),
    // 📊 budget-sync: per-country real fiscal ratios for the exact-mirror metrics.
    fiscalRatiosProvider(db),
    // Dynamic fiscal-growth: per-country trade inputs (tariff/foreign-tax/forex/
    // FTA/bloc) + lagged inflation, consumed by the wageGrowth/tradeGrowth nodes.
    fiscalTradeInputsProvider(db),
    // v2-2: read the labour mode via the SAME db (mock-db safe — see the
    // demographics-phase gotcha) so labourWageIndexDelta only feeds
    // medianIncome.
    gameConfigCollection(db)
      .findOne(
        { _id: "default" },
        {
          projection: {
            privateBankingEnabled: 1,
          },
        }
      )
      .catch(() => null),
    // Bridge A: 4 of the 6 TFP basket inputs live on demolished stateMetrics
    // categories, so playable regions resolved them all to TFP_REFERENCE_INPUTS
    // and their potential growth was near-uniform. Non-playable regions are
    // absent from this map and keep the legacy read untouched.
    loadPoliticalMacroInputs(db, turn),
    countryGameStatesCollection<{ _id: string; status?: string }>(db)
      .find({ status: "active" })
      .project<{ _id: string }>({ _id: 1 })
      .toArray(),
    // A war is fought on somebody's ground, and that ground's roads should show it.
    // One small read of the live conflicts; countries at peace are absent from the map.
    warDamageProvider(db),
    // Destroyed conflict capital and its funded repair, folded into the stock below.
    loadRepairingCapacityObligations(db, turn),
  ]);
  const capacityByRegion = new Map<string, ConflictCapacityObligation[]>();
  for (const obligation of capacityObligations) {
    const list = capacityByRegion.get(obligation.regionId) ?? [];
    list.push(obligation);
    capacityByRegion.set(obligation.regionId, list);
  }
  const settledCapacityIds: string[] = [];

  const bankFailureEffects = await loadBankFailureEffects(
    db,
    turn,
    labourConfig?.privateBankingEnabled === true
  );

  // Resolve a country's prime rate: live central-bank doc → config default.
  const primeRateByBankId = new Map<string, number>();
  for (const b of centralBanks) {
    if (typeof b.primeRate === "number" && Number.isFinite(b.primeRate)) {
      primeRateByBankId.set(b._id, b.primeRate);
    }
  }
  const primeRateFor = (countryId: State["countryId"]): number =>
    primeRateByBankId.get(getBankId(countryId)) ??
    getCountryConfig(countryId).centralBank.defaultPrimeRate;

  // Per-state prev lookups. Non-finite values are rejected (typeof NaN ===
  // "number") so a corrupted prior never poisons the EMA.
  // P1c-2: the sector node bears the EMA + policy delta, so its prev keys off
  // economic.sectorGrowth (legacy economic.gdpGrowth as cutover fallback).
  const prevSectorValue = new Map<string, number>();
  const prevSectorBaseline = new Map<string, number>();
  const prevUnemployment = new Map<string, number>();
  // P1c-1: prior labor force (for g_L) and current laborParticipation (for L).
  const prevLaborForce = new Map<string, number>();
  const laborParticipationByState = new Map<string, number>();
  for (const m of prevMetrics) {
    const g = finite(m.economic?.sectorGrowth?.value) ?? finite(m.economic?.gdpGrowth?.value);
    if (g !== undefined) prevSectorValue.set(m._id, g);
    const b =
      finite(m.economic?.sectorGrowth?.simBaseline) ??
      finite(m.economic?.gdpGrowth?.simBaseline) ??
      finite(m.economic?.gdpGrowth?.sectorBaseline);
    if (b !== undefined) prevSectorBaseline.set(m._id, b);
    const u = finite(m.economic?.unemploymentRate?.value);
    if (u !== undefined) prevUnemployment.set(m._id, u);
    const lf = finite(m.economic?.laborForce?.value);
    if (lf !== undefined) prevLaborForce.set(m._id, lf);
    const lp = finite(m.economic?.laborParticipation?.value);
    if (lp !== undefined) laborParticipationByState.set(m._id, lp);
  }

  // Raw prev docs by state for the generic-node reads (the typed maps above
  // cover only the bespoke economic fields).
  const prevDocById = new Map<string, PrevMetricsDoc>(prevMetrics.map((m) => [m._id, m]));

  const realStates = allStates.filter((s) => !NATIONAL_SCOPE_IDS.has(s._id));
  if (realStates.length === 0) return { kind: "early" as const, value: 0 };

  // V2 programs are the relief owner, including laws passed before this fix.
  // No per-region reads and no assumption that a missing settlement is funded.
  const povertyPolicies = await loadPovertyPolicyInputs(db, {
    worldId: eraGameState?.resetWorldId ?? "",
    turn,
    regions: realStates.filter(
      (state) =>
        resetSystemVersionsForCountry(eraGameState, RESET_V2_READY, state.countryId).legislation ===
        "v2"
    ),
  });

  const employmentPolicies = await loadEmploymentPolicies(db, turn, realStates, {
    national: true,
    regional: true,
    year: eraYear ?? undefined,
    baselineYear: eraGameState?.startingYear,
  });

  // 2027 world: enacted zoning and wage insurance laws, one read for all countries.
  const societyOn = presetUsesSocietyPressures(eraGameState?.preset ?? undefined);
  const societyLaws = societyOn
    ? await loadSocietyLawPositions(db, [...new Set(realStates.map((s) => s.countryId))])
    : new Map<string, typeof NO_SOCIETY_LAWS>();
  // 2027 world: the US and UK automation laws that speed re-employment.
  const automationPolicies = societyOn ? await loadAutomationPolicies(db) : undefined;

  // One in-memory pass over the political boards already loaded above. This
  // avoids a country-by-country query loop on the multiplayer turn path.
  const healthTotalsByCountry = new Map<
    string,
    Map<string, { weighted: number; population: number }>
  >();
  for (const state of realStates) {
    const values = politicalInputs.values(state._id);
    if (!values) continue;
    const population = Math.max(0, state.population ?? 0);
    if (population <= 0) continue;
    const totals = healthTotalsByCountry.get(state.countryId) ?? new Map();
    for (const id of DEMOCRATIC_HEALTH_METRIC_IDS) {
      const value = values[id];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const current = totals.get(id) ?? { weighted: 0, population: 0 };
      current.weighted += value * population;
      current.population += population;
      totals.set(id, current);
    }
    healthTotalsByCountry.set(state.countryId, totals);
  }
  const democraticHealthDragByCountry = new Map<string, number>();
  const healthCountries = [...healthTotalsByCountry.keys()];
  const competitionByCountry = new Map(
    await Promise.all(
      healthCountries.map(
        async (countryId) =>
          [
            countryId,
            await loadDemocraticCompetition(
              db,
              countryId as CountryId,
              eraGameState?.preset,
              eraGameState
            ),
          ] as const
      )
    )
  );
  for (const [countryId, totals] of healthTotalsByCountry) {
    const config = getCountryConfig(countryId as CountryId, eraGameState?.preset);
    if (!supportsGovernanceStyle(config.governmentType)) continue;
    const values = Object.fromEntries(
      [...totals].map(([id, total]) => [id, total.weighted / total.population])
    );
    // Economic fallout uses the same displayed Democratic Health score as
    // elections, including entrenched legislative, executive, and court control.
    const health = scoreGovernanceStyle(values, competitionByCountry.get(countryId))
      .democraticHealth.value;
    democraticHealthDragByCountry.set(countryId, democraticHealthEconomicDrag(health));
  }

  const now = new Date();
  const macroOps: Array<{
    updateOne: {
      filter: { _id: string };
      update: {
        $set: Record<
          string,
          number | Date | EmploymentState | ProductivityState | SocietyPressureState
        >;
        $unset?: Record<string, "">;
      };
    };
  }> = [];
  // GDP-level stock writes to the `states` collection (SSOT — design §5.4). The
  // engine compounds state.gdp each turn by the region's freshly-computed
  // gdpGrowth, so the GDP LEVEL (not just the rate) moves over time.
  const stateOps: Array<{
    updateOne: {
      filter: { _id: string };
      update: {
        $set: Record<string, number | string | RevenueSnapshot[] | ConflictCapacityApplied>;
        $unset?: Record<string, "">;
      };
    };
  }> = [];

  // Active organization directives nudge a curated metric across every member
  // state (Phase 2A-ii). Loaded once here, then merged into each member's
  // `targetNudges` below. Empty map when no directives are active → the merge is
  // a no-op (parity / golden-master fast path).
  // Security-alliance alert posture and funded agency programmes apply the same
  // kind of member-wide nudge (Phase 2B). The three loads are independent, so
  // they run as one parallel round-trip instead of three serial ones.
  const [directiveNudgesByCountry, postureNudgesByCountry, agencyNudgesByCountry] =
    await Promise.all([
      loadActiveDirectiveNudgesByCountry(db),
      loadActivePostureNudgesByCountry(db),
      loadActiveAgencyNudgesByCountry(db, turn),
    ]);

  // ── Macro-growth v1 (design §4): per-country convergence + openness inputs ──
  // Computed once per turn, applied to every region's potential in the loop.
  // fxByCurrency is shared by O2 (per-capita anchor normalization) and O1c
  // (₳→local corp investment).
  const fxByCurrency = await loadValuationFxRates(db);
  // National state-ownership concentration (SOCI) per country — lagged command signal.
  const sociByCountry = new Map<string, number>();
  const budgets = await (
    await getFederalBudgetCollection(db)
  )
    .find(
      {},
      {
        projection: {
          countryId: 1,
          stateOwnershipConcentration: 1,
          priceIndex: 1,
          gdp: 1,
          gdpSmoothed: 1,
          "economicFactors.inflationRate": 1,
        },
      }
    )
    .toArray();
  // Price level per country: `state.gdp` is nominal (real output times the index).
  // The index before this turn deflates it for the real economy; the index after
  // inflates the compounded real output back.
  const priceIndexBefore = new Map<string, number>();
  const priceIndexAfter = new Map<string, number>();
  const budgetIdByCountry = new Map<string, string>();
  const smoothedGdpBefore = new Map<string, number | undefined>();
  const inflationByCountry = new Map<string, number>();
  for (const b of budgets) {
    const cid = b.countryId || (b._id === "federal" ? "US" : b._id);
    budgetIdByCountry.set(cid, b._id);
    priceIndexBefore.set(cid, resolvePriceIndex(b.priceIndex));
    smoothedGdpBefore.set(cid, b.gdpSmoothed ?? b.gdp);
    // An unseeded budget has no inflation to compound.
    inflationByCountry.set(cid, b.economicFactors?.inflationRate ?? 0);
    if (typeof b.stateOwnershipConcentration === "number") {
      sociByCountry.set(cid, b.stateOwnershipConcentration);
    }
  }
  for (const [cid, before] of priceIndexBefore) {
    priceIndexAfter.set(
      cid,
      advancePriceIndex(before, inflationByCountry.get(cid) ?? 0, TURNS_PER_YEAR)
    );
  }
  const realGdpOf = (s: { countryId: string; gdp?: number }) =>
    toRealOutput(s.gdp ?? 0, priceIndexBefore.get(s.countryId));
  const nominalGdpByCountry = new Map<string, number>();
  // Σ GDP + population per country from the states already loaded.
  const gdpByCountry = new Map<string, number>();
  const popByCountry = new Map<string, number>();
  for (const s of realStates) {
    gdpByCountry.set(s.countryId, (gdpByCountry.get(s.countryId) ?? 0) + realGdpOf(s));
    popByCountry.set(s.countryId, (popByCountry.get(s.countryId) ?? 0) + (s.population ?? 0));
  }
  const rows: CountryMacroRaw[] = [];
  const activeCountryIds = new Set(countryGameStates.map((row) => row._id));
  const developmentTotals = new Map<
    string,
    Record<"industrialPolicyExecution" | "workforceSkill" | "transportEfficiency", number>
  >();
  const developmentCounts = new Map<
    string,
    Record<"industrialPolicyExecution" | "workforceSkill" | "transportEfficiency", number>
  >();
  const developmentPaths = {
    industrialPolicyExecution: "economic.industrialPolicyExecution",
    workforceSkill: "education.workforceSkill",
    transportEfficiency: "infrastructure.transportEfficiency",
  } as const;
  const publicCapitalByCountry = new Map<string, number>();
  for (const state of realStates) {
    const totals = developmentTotals.get(state.countryId) ?? {
      industrialPolicyExecution: 0,
      workforceSkill: 0,
      transportEfficiency: 0,
    };
    const counts = developmentCounts.get(state.countryId) ?? {
      industrialPolicyExecution: 0,
      workforceSkill: 0,
      transportEfficiency: 0,
    };
    const prevDoc = prevDocById.get(state._id);
    for (const [key, path] of Object.entries(developmentPaths) as Array<
      [keyof typeof developmentPaths, string]
    >) {
      const value =
        politicalInputs.legacyUnit(state._id, path) ?? readMetricPath(prevDoc, path, "value");
      if (value === undefined) continue;
      totals[key] += value;
      counts[key] += 1;
    }
    developmentTotals.set(state.countryId, totals);
    developmentCounts.set(state.countryId, counts);
    publicCapitalByCountry.set(
      state.countryId,
      (publicCapitalByCountry.get(state.countryId) ?? 0) +
        (spendingRollup.publicCapitalAnnualLocalMillionsByRegion.get(state._id) ?? 0)
    );
  }
  for (const countryId of gdpByCountry.keys()) {
    const nationalDocId = getNationalDocId(countryId as CountryId);
    // The active-country filter is applied by the pure precompute below.
    // Older worlds with an empty registry retain the national-doc fallback.
    if (!nationalDocId) continue;
    const natDoc = prevDocById.get(nationalDocId);
    const totals = developmentTotals.get(countryId);
    const counts = developmentCounts.get(countryId);
    const average = (key: keyof typeof developmentPaths): number | undefined =>
      totals && counts && counts[key] > 0 ? totals[key] / counts[key] : undefined;
    rows.push({
      countryId,
      gdpLocalMillions: gdpByCountry.get(countryId) ?? 0,
      population: popByCountry.get(countryId) ?? 0,
      soci: sociByCountry.get(countryId),
      // Lagged national gate metrics (prev-turn national doc — the C3 lag).
      tradeGrowth: readMetricPath(natDoc, "economic.tradeGrowth", "value"),
      economicFreedom: readMetricPath(natDoc, "economic.economicFreedom", "value"),
      industrialPolicyExecution: average("industrialPolicyExecution"),
      workforceSkill: average("workforceSkill"),
      transportEfficiency: average("transportEfficiency"),
      publicInvestmentEffort: Math.min(
        1,
        (publicCapitalByCountry.get(countryId) ?? 0) /
          Math.max(1, (gdpByCountry.get(countryId) ?? 0) * 0.05)
      ),
    });
  }
  const macroInputs = buildMacroGrowthInputs(rows, eraGameState?.preset, activeCountryIds);

  // Per-country memos: synergy nudges and era envelopes depend only on the
  // country (model, directives, era year), not the state, so compute each
  // country's set once instead of once per state.
  const targetNudgesByCountry = new Map<string, Record<NodeId, number>>();
  const envelopesByCountry = new Map<string, Record<string, { limit: number; kind: "ceiling" }>>();
  return {
    kind: "context" as const,
    context: {
      advanceBudgetGdpBasis,
      agencyNudgesByCountry,
      approvalByCountry,
      armedConflicts,
      automationPolicies,
      bankFailureEffects,
      CABINET_V2_MACRO_NODES,
      capacityByRegion,
      db,
      DEFAULT_UNEMPLOYMENT,
      democraticHealthDragByCountry,
      directiveNudgesByCountry,
      employmentPolicies,
      envelopesByCountry,
      eraGameState,
      eraYear,
      finite,
      fiscalRatiosByCountry,
      fiscalTradeInputsByCountry,
      fxByCurrency,
      GENERIC_LAGGED_IDS,
      GENERIC_NODES,
      GENERIC_SEED_IDS,
      genericLaggedIds,
      laborParticipationByState,
      MACRO_NODES,
      macroInputs,
      macroOps,
      nodeIdByMetricId,
      nominalGdpByCountry,
      now,
      POLITICAL_INPUT_IDS,
      politicalInputs,
      postureNudgesByCountry,
      povertyPolicies,
      prevDocById,
      prevLaborForce,
      prevSectorBaseline,
      prevSectorValue,
      prevUnemployment,
      priceIndexAfter,
      priceIndexBefore,
      primeRateFor,
      readMetricPath,
      realGdpOf,
      realStates,
      sectorTax,
      settledCapacityIds,
      societyLaws,
      societyOn,
      spendingRollup,
      stateOps,
      targetNudgesByCountry,
      turn,
      warDamageByCountryId,
      budgetIdByCountry,
      smoothedGdpBefore,
    },
  };
}
export type RunMetricEngineStageContext = Extract<
  Awaited<ReturnType<typeof prepareRunMetricEngine>>,
  { kind: "context" }
>["context"];

export async function runMetricEngine(
  ...args: Parameters<typeof prepareRunMetricEngine>
): Promise<number> {
  const prepared = await prepareRunMetricEngine(...args);
  if (prepared.kind === "early") return prepared.value;
  return settleMetricStates(prepared.context);
}

/**
 * Writes each country's price index and the budget GDP basis once per turn. Both
 * `gdp` and `gdpSmoothed` carry the same smoothed nominal level, so every budget
 * reader (debt ratio, spending envelopes, deposit-book return, inflation fiscal
 * term) sees one up-to-date basis instead of a fiscal-close snapshot.
 */
async function advanceBudgetGdpBasis(
  db: Db,
  input: {
    budgetIdByCountry: Map<string, string>;
    priceIndexAfter: Map<string, number>;
    smoothedGdpBefore: Map<string, number | undefined>;
    nominalGdpMillionsByCountry: Map<string, number>;
  }
): Promise<void> {
  const ops: AnyBulkWriteOperation<FederalBudget>[] = [];
  for (const [countryId, millions] of input.nominalGdpMillionsByCountry) {
    const budgetId = input.budgetIdByCountry.get(countryId);
    const priceIndex = input.priceIndexAfter.get(countryId);
    if (budgetId === undefined || priceIndex === undefined) continue;
    const $set: Record<string, number> = { priceIndex };
    if (millions > 0) {
      const smoothed = smoothNationalGdpPerTurn(
        input.smoothedGdpBefore.get(countryId),
        millions * 1_000_000,
        GDP_SMOOTHING_INERTIA,
        TURNS_PER_YEAR
      );
      $set.gdp = smoothed;
      $set.gdpSmoothed = smoothed;
    }
    ops.push({ updateOne: { filter: { _id: budgetId as never }, update: { $set } } });
  }
  if (ops.length > 0) await (await getFederalBudgetCollection(db)).bulkWrite(ops);
}
