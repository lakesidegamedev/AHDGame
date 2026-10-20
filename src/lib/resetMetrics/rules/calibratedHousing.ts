/**
 * Housing costs and available homes use a labeled residential model, not plant counts.
 * prepareCalibratedHousing links current household resources, funded housing laws
 * and local construction services; incomplete countries stay on their prior owner.
 */
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { resetLawFamilyById } from "@/lib/resetLegislation/catalog";
import { resolveHouseholdResources } from "./householdResources";
import { isPublicHouseholdCalibration } from "./householdSources";
import type { HouseholdDecodedReference } from "./householdSources";
import type { HouseholdPublicationSource } from "./householdPublication";
import { HOUSING_REFERENCE_INPUTS, type HousingPublicationSource } from "./housingPublication";
import { housingFunding, type HousingRole } from "./housingFunding";
import { advanceHousing, type HousingModelState, type HousingState } from "./housing";
import { deliveredLawFactor, type MetricLawProgram, type MetricLawSettlement } from "./lawDelivery";

export const HOUSING_MODEL_ASSUMPTIONS = [
  "Synthetic residential model for complete 1991 US, UK and JP household cohorts, not a dwelling register or housing survey. All regional stock geography is modeled from household counts.",
  "Opening unoccupied stock shares: US 1990 Census 10316268/102263678; UK 4% private-sector England April 1990 estimate applied to all UK regions; JP 1988 Housing Survey 3940000/42007300. Vacant, second and unavailable homes differ: only 1% of vacant stock per turn is offered for rehousing.",
  "One occupied dwelling per modeled household initially; opening homelessness is 0.1% of residents, not a comparable official count. New homelessness hazard is 0.02% per turn among modeled people in households spending over half their disposable income on housing. Population and household formation affect occupancy and displacement.",
  "Opening annual shelter cost is 25% of mean opening market income, allocated by square root of household size. Rents track local consumer prices and the ratio of household demand to usable stock, capped between half and twice the opening pressure. This is an aggregate cost model, not a tenure-specific rent or mortgage survey.",
  "Background private residential investment is modeled as 8% of annual household market income, divided by 48; it is not a corporate cash debit or a bank disbursement. A dwelling costs four years of opening mean market income, price-indexed. Unspent construction finance carries in the residential model only.",
  "25% of measured local construction-service crew-days, times 365/48 days per turn, serves residential projects; 120 crew-days build one dwelling. Service production already reflects business staffing and input constraints. This allocation does not reserve commodity supply or prove a residential sale. Actual business facility construction is never counted as completed housing.",
  "Residential projects take 12 turns to mature. The model starts with no invented historic pipeline; new completions are constrained by cash, local construction services and planning. Losses are modeled at 0.2% of stock per year. Fractional losses accumulate deterministically by turn rather than rounding small regions up every turn.",
  "Missing inputs freeze the last valid reading. On recovery only the current turn's resources and capacity are applied to the retained stocks; missed funding, completions and history are not backfilled. Pending projects can mature during the gap but still require current completion capacity and retained financing.",
  "L22 construction shares by ideological position are 80/65/35/10/0%; remaining funding is land, administration and permitting, not extra homes. Funded planning options add up to 50% to a baseline annual planning limit of 3% of opening stock but cannot create construction crews.",
  "L23 restricted housing-cost relief shares are 80/80/65/50/40%, targeted first to modeled households with costs over 30% of disposable income. Remaining funding covers repairs, administration and other services. Ownership-relief incidence is approximated, not a modeled tenure or tax-credit register. Restricted relief reduces costs only, never disposable income too.",
  "L24 placement-service shares are 70/80/65/75/60%. One placement costs 10% of a modeled dwelling; placements still require available homes. National laws use actual current outlays; regional laws use current funded annual accrual explicitly as model resources, not paid cash. Missing or stale evidence never supplies assumed full funding.",
] as const;
export const HOUSING_MODEL_SOURCES = [
  "https://www.census.gov/history/pdf/ApportionmentInformation-1990Census.pdf",
  "https://api.parliament.uk/historic-hansard/written-answers/1991/feb/28/vacant-properties-2",
  "https://www.stat.go.jp/english/data/nenkan/pdf/yhyou21.pdf",
] as const;

export interface HousingConstructionReading {
  regionId: string;
  population: number;
  turn: number;
  /** Current measured construction-service units per day, not facilities or dwellings. */
  crewDays: number;
}

export function prepareCalibratedHousing(input: {
  worldId: string;
  countryId: string;
  preset: string;
  turn: number;
  reference: HouseholdDecodedReference | undefined;
  households: HouseholdPublicationSource | undefined;
  construction: readonly HousingConstructionReading[];
  priorStates: ReadonlyMap<string, HousingState>;
  programs: readonly MetricLawProgram[];
  settlements: ReadonlyMap<string, MetricLawSettlement>;
}): { source?: HousingPublicationSource; gaps: string[] } {
  const fail = (gap: string) => ({ gaps: [gap] });
  const households = input.households,
    reference = input.reference;
  if (!["US", "UK", "JP"].includes(input.countryId) || input.preset !== "1991-default")
    return fail("unsupported-housing-country-or-preset");
  if (
    !input.worldId ||
    !Number.isSafeInteger(input.turn) ||
    input.turn < 2 ||
    !households ||
    !reference ||
    !isPublicHouseholdCalibration(households.calibration) ||
    !isPublicHouseholdCalibration(reference.calibration) ||
    reference.countryId !== input.countryId ||
    households.worldId !== input.worldId ||
    households.coverage.countryId !== input.countryId ||
    households.coverage.measurementTurn !== input.turn ||
    households.coverage.currency !== reference.currency
  )
    return fail("incomplete-current-housing-households");
  const readings = new Map(input.construction.map((r) => [r.regionId, r]));
  const ids = households.inputs.map((r) => r.regionId);
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    readings.size !== ids.length ||
    input.construction.length !== ids.length ||
    ids.some((id) => !readings.has(id)) ||
    input.construction.some(
      (r) =>
        r.turn !== input.turn ||
        !Number.isSafeInteger(r.population) ||
        r.population <= 0 ||
        !Number.isFinite(r.crewDays) ||
        r.crewDays < 0
    )
  )
    return fail("incomplete-current-construction-services");
  const programs = input.programs.filter((p) => p.country === input.countryId);
  const roles: HousingRole[] = [];
  for (const p of programs) {
    const family = resetLawFamilyById(p.familyId);
    const level = family?.levels.findIndex((l) => l.position === p.choice) ?? -1;
    if (
      !family ||
      (level < 0 && !(p.choice === "leave_to_states" && family.leaveToStates)) ||
      (p.scope === "regional" && !ids.includes(p.regionId ?? ""))
    )
      return fail("unclassified-housing-law-or-geography");
    const role =
      p.choice === "leave_to_states"
        ? "other"
        : p.familyId === "L22"
          ? "construction"
          : p.familyId === "L23"
            ? "landlord-assistance"
            : p.familyId === "L24"
              ? "rehousing"
              : "other";
    roles.push({
      programId: p._id,
      familyId: p.familyId,
      effectiveTurn: p.effectiveTurn,
      choice: p.choice,
      role,
      ...(role === "other"
        ? {}
        : {
            share: (p.familyId === "L22"
              ? [0.8, 0.65, 0.35, 0.1, 0]
              : p.familyId === "L23"
                ? [0.8, 0.8, 0.65, 0.5, 0.4]
                : [0.7, 0.8, 0.65, 0.75, 0.6])[level]!,
          }),
    });
  }
  const funds = housingFunding({
    countryId: input.countryId,
    turn: input.turn,
    modeled: true,
    regions: input.construction,
    programs,
    settlements: input.settlements,
    roles,
    householdCashShares: new Map(
      households.programRoles
        .filter((r) => r.role === "cash")
        .map((r) => [r.programId, r.cashShare ?? 0])
    ),
  });
  if (!funds) return fail("incomplete-housing-funding-evidence");
  const source: HousingPublicationSource = {
    worldId: input.worldId,
    countryId: input.countryId,
    currency: reference.currency,
    measurementTurn: input.turn,
    calibration: {
      kind: "public-calibrated-housing",
      version: 1,
      assumptions: [...HOUSING_MODEL_ASSUMPTIONS],
      sourceUrls: [...HOUSING_MODEL_SOURCES],
    },
    references: Object.fromEntries(
      HOUSING_REFERENCE_INPUTS.map((key) => [
        key,
        { basis: "public-calibrated-model" as const, sourceId: `residential-cohorts-v1:${key}` },
      ])
    ),
    privateFinance: {
      sourceId: "modeled-background-residential-investment-not-cash",
      worldId: input.worldId,
      countryId: input.countryId,
      currency: reference.currency,
      turn: input.turn,
      amount: 0,
      regions: [],
    },
    programRoles: roles,
    regions: [],
  };
  const privateRows: { regionId: string; amount: number }[] = [];
  const regions: HousingPublicationSource["regions"][number][] = [];
  for (const h of households.inputs) {
    const current = resolveHouseholdResources(h),
      r = readings.get(h.regionId)!,
      fund = funds.get(h.regionId)!;
    const openingCells = reference.cells.filter((c) => c.sourceArea === h.regionId);
    if (
      !openingCells.length ||
      openingCells.some(
        (c) =>
          !Number.isFinite(c.households) ||
          c.households! <= 0 ||
          !Number.isFinite(c.marketIncome) ||
          c.marketIncome! < 0
      ) ||
      h.measurementTurn !== input.turn ||
      h.currency !== reference.currency ||
      h.countryId !== input.countryId ||
      !(h.consumerPriceIndex > 0) ||
      current.totals.people > r.population
    )
      return fail("incomplete-housing-region-anchor");
    const n = current.totals.households;
    const mean =
      openingCells.reduce((a, c) => a + c.marketIncome! * c.households!, 0) /
      openingCells.reduce((a, c) => a + c.households!, 0);
    if (!Number.isFinite(mean) || mean <= 0) return fail("invalid-housing-income-anchor");
    const vacantShare =
      input.countryId === "US"
        ? 10316268 / 102263678
        : input.countryId === "UK"
          ? 0.04
          : 3940000 / 42007300;
    const prior = input.priorStates.get(h.regionId);
    if (
      prior &&
      (!prior.model ||
        prior.model.version !== 1 ||
        !Number.isSafeInteger(prior.asOfTurn) ||
        prior.asOfTurn < 1 ||
        prior.asOfTurn > input.turn)
    )
      return fail("incompatible-or-missed-housing-state");
    const anchor: HousingModelState = prior?.model ?? {
      version: 1,
      openingHouseholds: n,
      openingMarketIncome: mean,
      openingPriceIndex: 100,
      openingDwellings: Math.ceil(n / (1 - vacantShare)),
      previousHouseholds: n,
      currentHouseholds: n,
    };
    if (
      ![
        anchor.openingHouseholds,
        anchor.openingMarketIncome,
        anchor.openingPriceIndex,
        anchor.openingDwellings,
        anchor.previousHouseholds,
        anchor.currentHouseholds,
      ].every((v) => Number.isFinite(v) && v > 0)
    )
      return fail("invalid-housing-model-state");
    const replay = prior?.asOfTurn === input.turn;
    const previousHouseholds = replay ? anchor.previousHouseholds : anchor.currentHouseholds;
    const model: HousingModelState = { ...anchor, previousHouseholds, currentHouseholds: n };
    const openingState: HousingState = prior ?? {
      worldId: input.worldId,
      countryId: input.countryId,
      regionId: h.regionId,
      asOfTurn: input.turn - 1,
      usableDwellings: anchor.openingDwellings,
      occupiedDwellings: Math.round(n),
      unhousedPeople: Math.round(r.population * 0.001),
      constructionCash: 0,
      pipeline: [],
      model: anchor,
    };
    const stock = replay ? (prior?.lastFlow?.openingStock ?? NaN) : openingState.usableDwellings;
    const occupied = replay
      ? (prior?.lastFlow?.openingOccupied ?? NaN)
      : openingState.occupiedDwellings;
    const openingCash = replay
      ? (prior?.lastFlow?.openingCash ?? NaN)
      : openingState.constructionCash;
    const pipelineDwellings = replay
      ? (prior?.lastFlow?.openingPipelineDwellings ?? NaN)
      : openingState.pipeline.reduce((n, p) => n + p.dwellings, 0);
    if (![occupied, openingCash, pipelineDwellings].every((v) => Number.isSafeInteger(v) && v >= 0))
      return fail("missing-housing-replay-anchors");
    if (!(stock > 0)) return fail("invalid-housing-stock-anchor");
    const priceRatio = h.consumerPriceIndex / anchor.openingPriceIndex;
    const cost = Math.max(1, Math.round(4 * anchor.openingMarketIncome * priceRatio));
    const privateAmount = Math.floor((current.totals.marketIncome * 0.08) / TURNS_PER_YEAR);
    privateRows.push({ regionId: h.regionId, amount: privateAmount });
    const cash = privateAmount + Math.floor(fund.construction);
    const capacity = Math.floor((r.crewDays * 0.25 * (365 / TURNS_PER_YEAR)) / 120);
    const planning = programs
      .filter((p) => p.familyId === "L22" && (p.scope === "national" || p.regionId === h.regionId))
      .reduce((max, p) => {
        const level = resetLawFamilyById(p.familyId)!.levels.findIndex(
          (l) => l.position === p.choice
        );
        return Math.max(
          max,
          (level < 0 ? 0 : [0, 0.1, 0.25, 0.4, 0.5][level]!) *
            deliveredLawFactor(p, input.settlements.get(p._id), input.turn)
        );
      }, 0);
    const rentPressure = Math.max(
      0.5,
      Math.min(2, n / stock / (anchor.openingHouseholds / anchor.openingDwellings))
    );
    const weights = h.groups.reduce(
      (sum, g) => sum + g.households * Math.sqrt(g.adults + g.children),
      0
    );
    const payments = current.cells.map((c) => ({
      groupId: c.id,
      annualPayments:
        (0.25 *
          anchor.openingMarketIncome *
          priceRatio *
          rentPressure *
          Math.sqrt(c.people / c.households) *
          n) /
        weights,
      annualLandlordAssistance: 0,
    }));
    let relief = fund.annualAssistance;
    for (const payment of [...payments].sort((a, b) => {
      const ai = current.cells.find((c) => c.id === a.groupId)!.disposableIncome;
      const bi = current.cells.find((c) => c.id === b.groupId)!.disposableIncome;
      return ai - bi || a.groupId.localeCompare(b.groupId);
    })) {
      const cell = current.cells.find((c) => c.id === payment.groupId)!;
      const need =
        Math.max(0, payment.annualPayments - cell.disposableIncome * 0.3) * cell.households;
      const amount = Math.min(relief, need);
      payment.annualLandlordAssistance = amount / cell.households;
      relief -= amount;
    }
    // Unused restricted aid is not an invented household transfer.
    const loss = Math.min(
      stock,
      Math.floor((input.turn * anchor.openingDwellings * 0.002) / TURNS_PER_YEAR) -
        Math.floor(((input.turn - 1) * anchor.openingDwellings * 0.002) / TURNS_PER_YEAR)
    );
    const availableVacancies = stock - occupied;
    // Losses take vacant homes first; the residual displaces occupied households.
    const occupiedLost = Math.max(0, loss - Math.max(0, Math.floor(availableVacancies)));
    const householdGrowth = Math.max(0, Math.floor(n - previousHouseholds));
    const shrink = Math.max(0, Math.floor(previousHouseholds - n));
    const hazard = current.cells.reduce((sum, c) => {
      const p = payments.find((p) => p.groupId === c.id)!;
      return (
        sum +
        (p.annualPayments - p.annualLandlordAssistance > c.disposableIncome * 0.5
          ? c.people * 0.0002
          : 0)
      );
    }, 0);
    const pipelineLength = replay
      ? (prior?.lastFlow?.openingPipelineLength ?? NaN)
      : openingState.pipeline.length;
    if (!Number.isSafeInteger(pipelineLength)) return fail("missing-housing-replay-anchors");
    const newProjects =
      pipelineLength >= 240
        ? 0
        : Math.max(0, Math.floor((cash + openingCash) / cost) - pipelineDwellings);
    regions.push({
      regionId: h.regionId,
      openingState,
      model,
      payments,
      flow: {
        turn: input.turn,
        population: r.population,
        constructionCashReceived: cash,
        costPerCompletedDwelling: cost,
        materialCapacity: capacity,
        laborCapacity: capacity,
        financeCapacity: capacity,
        planningCapacity: Math.floor(
          ((anchor.openingDwellings * 0.03) / TURNS_PER_YEAR) * (1 + planning)
        ),
        newProjects: newProjects
          ? [
              {
                id: `residential:${h.regionId}:${input.turn}`,
                dwellings: newProjects,
                earliestCompletionTurn: input.turn + 12,
              },
            ]
          : [],
        dwellingsLost: loss,
        occupiedDwellingsLost: occupiedLost,
        displacedPeople: occupiedLost * 2,
        vacatedDwellings: Math.min(shrink, Math.max(0, occupied - occupiedLost)),
        otherNewOccupancies: householdGrowth,
        newlyUnhousedPeople: Math.floor(hazard),
        rehousingHouseholds: Math.min(
          Math.floor(fund.rehousing / Math.max(1, cost * 0.1)),
          Math.floor(Math.max(0, stock - occupied) * 0.01)
        ),
        peoplePerRehousing: 2,
        peoplePerUnplacedHousehold: 2,
        ...((replay
          ? prior?.lastFlow?.resumedFromTurn
          : prior && prior.asOfTurn < input.turn - 1
            ? prior.asOfTurn
            : undefined) !== undefined
          ? { resumeFromTurn: replay ? prior!.lastFlow!.resumedFromTurn : prior!.asOfTurn }
          : {}),
      },
    });
  }
  source.regions = regions;
  // Malformed current input keeps a not-yet-adopted country on legacy; changed
  // input during an already-persisted turn must still abort partial recovery.
  for (const region of regions) {
    try {
      advanceHousing(region.openingState, region.flow);
    } catch (error) {
      if (region.openingState.asOfTurn === input.turn) throw error;
      return fail("invalid-current-residential-flow");
    }
  }
  source.privateFinance.regions = privateRows;
  source.privateFinance.amount = privateRows.reduce((n, r) => n + r.amount, 0);
  return { source, gaps: [] };
}
