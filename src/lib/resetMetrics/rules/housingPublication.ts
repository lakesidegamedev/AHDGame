/**
 * Housing publication requires reference-complete households and housing stocks.
 * housingPublication reconciles actual construction and landlord-assistance
 * funding before advancing dwellings; incomplete countries keep existing values.
 */
import {
  advanceHousing,
  housingPaymentBurden,
  type HousingState,
  type HousingTurnInput,
  type HousingModelState,
} from "./housing";
import { housingFunding, type HousingRole } from "./housingFunding";
import { resolveHouseholdResources } from "./householdResources";
import {
  metricLawOutlaysAtTurn,
  type MetricLawProgram,
  type MetricLawSettlement,
  metricLawRoleMatches,
} from "./lawDelivery";
import { regionalCoverageKey, type HouseholdPublicationSource } from "./householdPublication";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import type { OpeningMetricObservation } from "./openingObservation";

export const HOUSING_REFERENCE_INPUTS = [
  "dwellingStock",
  "occupancy",
  "housingPayments",
  "constructionCapacity",
  "rehousingFlows",
  "finance",
] as const;
export const HOUSING_PUBLICATION_IDS = ["24", "25", "41"] as const;
export interface HousingPublicationSource {
  /** Model provenance is explicit; it does not certify source inputs as observed. */
  calibration?: {
    kind: "public-calibrated-housing";
    version: 1;
    assumptions: readonly string[];
    sourceUrls: readonly string[];
  };
  worldId: string;
  countryId: string;
  currency: string;
  measurementTurn: number;
  references: Partial<
    Record<
      (typeof HOUSING_REFERENCE_INPUTS)[number],
      { basis: "reference" | "synthetic" | "public-calibrated-model"; sourceId: string }
    >
  >;
  /** Independent current-turn finance evidence; no private cash is inferred from corporate output. */
  privateFinance: {
    sourceId: string;
    worldId: string;
    countryId: string;
    currency: string;
    turn: number;
    amount: number;
    regions?: readonly { regionId: string; amount: number }[];
  };
  programRoles: readonly HousingRole[];
  regions: readonly {
    regionId: string;
    openingState: HousingState;
    flow: HousingTurnInput;
    model?: HousingModelState;
    payments: readonly {
      groupId: string;
      annualPayments: number;
      annualLandlordAssistance: number;
    }[];
  }[];
}

export function housingPublication(input: {
  worldId: string;
  countryId: string;
  turn: number;
  regionIds: readonly string[];
  source: HousingPublicationSource | undefined;
  householdSource: HouseholdPublicationSource | undefined;
  householdReadings: ReadonlyMap<string, Record<string, OpeningMetricObservation>>;
  priorStates: ReadonlyMap<string, HousingState>;
  programs: readonly MetricLawProgram[];
  settlements: ReadonlyMap<string, MetricLawSettlement>;
}): Map<string, { updates: Record<string, OpeningMetricObservation>; state: HousingState }> {
  const output = new Map<
    string,
    { updates: Record<string, OpeningMetricObservation>; state: HousingState }
  >();
  const source = input.source,
    households = input.householdSource;
  const modeled =
    source?.calibration?.kind === "public-calibrated-housing" && source.calibration.version === 1;
  const coverageKey = regionalCoverageKey(input.regionIds);
  if (
    !source ||
    !households ||
    source.worldId !== input.worldId ||
    source.countryId !== input.countryId ||
    source.measurementTurn !== input.turn ||
    source.currency !== households.coverage.currency ||
    source.regions.length !== input.regionIds.length ||
    new Set(source.regions.map((r) => r.regionId)).size !== source.regions.length ||
    regionalCoverageKey(source.regions.map((r) => r.regionId)) !== coverageKey ||
    HOUSING_REFERENCE_INPUTS.some(
      (key) =>
        (source.references[key]?.basis !== "reference" &&
          !(modeled && source.references[key]?.basis === "public-calibrated-model")) ||
        !source.references[key]?.sourceId.trim()
    ) ||
    input.regionIds.some(
      (id) =>
        input.householdReadings.get(id)?.["02"]?.definitionVersion !== 2 ||
        input.householdReadings.get(id)?.["02"]?.observedAtTurn !== input.turn
    )
  )
    return output;
  if (
    source.calibration &&
    (!modeled ||
      !source.calibration.assumptions.length ||
      !source.calibration.sourceUrls.length ||
      source.calibration.assumptions.some((a) => !a.trim()) ||
      source.calibration.sourceUrls.some((url) => !url.startsWith("https://")))
  )
    return output;
  const finance = source.privateFinance;
  if (
    !finance.sourceId.trim() ||
    finance.worldId !== input.worldId ||
    finance.countryId !== input.countryId ||
    finance.currency !== source.currency ||
    finance.turn !== input.turn ||
    !Number.isSafeInteger(finance.amount) ||
    finance.amount < 0
  )
    return output;
  const programs = input.programs.filter((p) => p.country === input.countryId);
  const roles = new Map(source.programRoles.map((r) => [r.programId, r]));
  if (
    roles.size !== programs.length ||
    roles.size !== source.programRoles.length ||
    programs.some((p) => !metricLawRoleMatches(p, roles.get(p._id)))
  )
    return output;
  let constructionCash = finance.amount,
    annualAssistance = 0;
  const modelFunding = modeled
    ? housingFunding({
        countryId: input.countryId,
        turn: input.turn,
        modeled: true,
        regions: source.regions.map((r) => ({
          regionId: r.regionId,
          population: r.flow.population,
        })),
        programs,
        settlements: input.settlements,
        roles: source.programRoles,
        householdCashShares: new Map(
          households.programRoles
            .filter((r) => r.role === "cash")
            .map((r) => [r.programId, r.cashShare ?? 0])
        ),
      })
    : undefined;
  if (
    modeled &&
    (!modelFunding ||
      !finance.regions ||
      finance.regions.length !== source.regions.length ||
      new Set(finance.regions.map((r) => r.regionId)).size !== source.regions.length ||
      finance.regions.some(
        (r) => !modelFunding.has(r.regionId) || !Number.isSafeInteger(r.amount) || r.amount < 0
      ) ||
      finance.regions.reduce((n, r) => n + r.amount, 0) !== finance.amount)
  )
    return output;
  const seen = new Set<string>();
  for (const program of programs) {
    if (modeled) break;
    const role = roles.get(program._id)!;
    if (role.role === "other") continue;
    // Observed-flow packets need a separately reconciled placement ledger;
    // never silently reclassify placement services as landlord assistance.
    if (role.role === "rehousing") return output;
    const householdRole = households.programRoles.find((r) => r.programId === program._id);
    const cashShare = householdRole?.role === "cash" ? (householdRole.cashShare ?? 0) : 0;
    if (
      program.scope !== "national" ||
      !Number.isFinite(role.share) ||
      role.share! < 0 ||
      role.share! > 1 ||
      role.share! + cashShare > 1
    )
      return output;
    for (const receipt of metricLawOutlaysAtTurn([program], input.settlements, input.turn)) {
      if (seen.has(receipt.paymentKey)) return output;
      seen.add(receipt.paymentKey);
      if (role.role === "construction") constructionCash += receipt.amount * role.share!;
      else annualAssistance += receipt.amount * role.share! * TURNS_PER_YEAR;
    }
  }
  if (modeled)
    for (const row of modelFunding!.values()) {
      constructionCash += Math.floor(row.construction);
      annualAssistance += row.annualAssistance;
    }
  const declaredCash = source.regions.reduce((sum, r) => sum + r.flow.constructionCashReceived, 0);
  if (
    !Number.isFinite(declaredCash) ||
    Math.abs(declaredCash - constructionCash) > Math.max(1, constructionCash) * 1e-9
  )
    return output;
  const calculated: {
    regionId: string;
    state: HousingState;
    burden: ReturnType<typeof housingPaymentBurden>;
    population: number;
  }[] = [];
  let declaredAssistance = 0;
  for (const region of source.regions) {
    const householdInput = households.inputs.find((r) => r.regionId === region.regionId);
    if (
      !householdInput ||
      region.flow.turn !== input.turn ||
      region.payments.length !== householdInput.groups.length ||
      new Set(region.payments.map((p) => p.groupId)).size !== region.payments.length
    )
      return new Map();
    if (
      modeled &&
      region.flow.constructionCashReceived !==
        Math.floor(modelFunding!.get(region.regionId)!.construction) +
          finance.regions!.find((r) => r.regionId === region.regionId)!.amount
    )
      return new Map();
    const reading = resolveHouseholdResources(householdInput);
    const groups = region.payments.map((p) => {
      const cell = reading.cells.find((c) => c.id === p.groupId);
      if (!cell) throw new Error("Housing payment refers to an unknown household group");
      declaredAssistance += p.annualLandlordAssistance * cell.households;
      return {
        id: cell.id,
        households: cell.households,
        annualDisposableIncome: cell.disposableIncome,
        annualHousingPayments: p.annualPayments,
        annualLandlordAssistance: p.annualLandlordAssistance,
      };
    });
    if (
      modeled &&
      region.payments.reduce(
        (n, p) =>
          n + p.annualLandlordAssistance * groups.find((g) => g.id === p.groupId)!.households,
        0
      ) >
        modelFunding!.get(region.regionId)!.annualAssistance +
          Math.max(1, modelFunding!.get(region.regionId)!.annualAssistance) * 1e-9
    )
      return new Map();
    const burden = housingPaymentBurden(groups);
    if (burden.paymentBurden === null) return new Map();
    const prior = input.priorStates.get(region.regionId) ?? region.openingState;
    if (
      prior.worldId !== input.worldId ||
      prior.countryId !== input.countryId ||
      prior.regionId !== region.regionId ||
      (prior.asOfTurn !== input.turn - 1 &&
        prior.asOfTurn !== input.turn &&
        !(
          modeled &&
          prior.model &&
          region.flow.resumeFromTurn === prior.asOfTurn &&
          prior.asOfTurn < input.turn - 1
        ))
    )
      return new Map();
    if (
      modeled &&
      prior.asOfTurn === input.turn &&
      JSON.stringify(prior.model) !== JSON.stringify(region.model)
    )
      throw new Error("Housing model changed during turn replay");
    const advanced = advanceHousing(prior, region.flow);
    const state = region.model ? { ...advanced, model: region.model } : advanced;
    if (!state.lastFlow || state.lastFlow.openingStock <= 0) return new Map();
    calculated.push({
      regionId: region.regionId,
      state,
      burden,
      population: region.flow.population,
    });
  }
  if (
    !Number.isFinite(declaredAssistance) ||
    (modeled
      ? declaredAssistance > annualAssistance + Math.max(1, annualAssistance) * 1e-9
      : Math.abs(declaredAssistance - annualAssistance) > Math.max(1, annualAssistance) * 1e-9)
  )
    return output;
  const sum = (value: (r: (typeof calculated)[number]) => number) =>
    calculated.reduce((n, r) => n + value(r), 0);
  const national = {
    "24": (100 * sum((r) => r.burden.payments)) / sum((r) => r.burden.income),
    "25":
      (100 * TURNS_PER_YEAR * sum((r) => r.state.lastFlow!.completed - r.state.lastFlow!.lost)) /
      sum((r) => r.state.lastFlow!.openingStock),
    "41": (10000 * sum((r) => r.state.unhousedPeople)) / sum((r) => r.population),
  };
  for (const row of calculated) {
    const definitions = [
      [
        "24",
        "social.housingCostBurden",
        row.burden.paymentBurden!,
        "% disposable income spent on housing",
      ],
      [
        "25",
        "social.housingSupplyGrowth",
        (100 * TURNS_PER_YEAR * (row.state.lastFlow!.completed - row.state.lastFlow!.lost)) /
          row.state.lastFlow!.openingStock,
        "% usable dwelling stock growth, annualized current-turn pace",
      ],
      [
        "41",
        "social.homelessnessRate",
        (10000 * row.state.unhousedPeople) / row.population,
        "unhoused people per 10,000 residents",
      ],
    ] as const;
    output.set(row.regionId, {
      state: row.state,
      updates: Object.fromEntries(
        definitions.map(([id, path, value, unit]) => [
          id,
          {
            metricId: id,
            path,
            value,
            unit,
            definitionVersion: 2,
            owner: "housing",
            status: modeled ? "proxy" : "derived",
            source: modeled
              ? "public-data-calibrated residential stock and payment model"
              : "reconciled reference housing stocks and flows",
            observedAtTurn: input.turn,
            note: modeled
              ? "Modeled residential stocks and payments, not observed housing records. National support uses paid outlays; regional support uses funded annual accrual, not cash receipts. Background residential finance, capacity allocation, rents and placements use documented assumptions. Business plants are not homes. Supply growth is annualized current-turn pace; cash benefits are not deducted twice."
              : "Uses usable completions, losses, paid funding, constrained construction and actual household payments. Landlord-paid assistance reduces costs; cash already included in disposable income is not deducted again. Supply growth is the annualized current-turn pace, not a measured trailing year.",
            countryBasis: {
              countryId: input.countryId,
              coverageKey,
              measurementTurn: input.turn,
              value: national[id],
            },
          },
        ])
      ),
    });
  }
  return output;
}
