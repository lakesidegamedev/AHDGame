/**
 * Housing supply grows only through usable completions. advanceHousing keeps
 * construction cash and dwelling stocks, constrains builds by funding and real
 * capacity, and allocates available homes before reducing homelessness.
 */
export interface HousingProject {
  id: string;
  dwellings: number;
  earliestCompletionTurn: number;
}
export interface HousingState {
  worldId: string;
  countryId: string;
  regionId: string;
  asOfTurn: number;
  usableDwellings: number;
  occupiedDwellings: number;
  unhousedPeople: number;
  constructionCash: number;
  pipeline: readonly HousingProject[];
  /** Bounded canonical input receipt prevents a changed source during partial turn recovery. */
  lastInputKey?: string;
  lastFlow?: {
    completed: number;
    lost: number;
    openingStock: number;
    spent: number;
    rehousedPeople: number;
  };
}
export interface HousingTurnInput {
  turn: number;
  population: number;
  constructionCashReceived: number;
  costPerCompletedDwelling: number;
  materialCapacity: number;
  laborCapacity: number;
  financeCapacity: number;
  planningCapacity: number;
  newProjects: readonly HousingProject[];
  dwellingsLost: number;
  occupiedDwellingsLost: number;
  displacedPeople: number;
  vacatedDwellings: number;
  otherNewOccupancies: number;
  newlyUnhousedPeople: number;
  rehousingHouseholds: number;
  peoplePerRehousing: number;
}

const count = (v: number) => Number.isSafeInteger(v) && v >= 0;
const MAX_HOUSING_PROJECTS = 256;

export function validateHousingState(state: HousingState): void {
  if (
    !state.worldId ||
    !state.countryId ||
    !state.regionId ||
    !count(state.asOfTurn) ||
    state.asOfTurn < 1 ||
    ![
      state.usableDwellings,
      state.occupiedDwellings,
      state.unhousedPeople,
      state.constructionCash,
    ].every(count) ||
    state.occupiedDwellings > state.usableDwellings ||
    state.pipeline.length > MAX_HOUSING_PROJECTS ||
    new Set(state.pipeline.map((p) => p.id)).size !== state.pipeline.length ||
    state.pipeline.some(
      (p) =>
        !p.id ||
        !count(p.dwellings) ||
        p.dwellings === 0 ||
        !count(p.earliestCompletionTurn) ||
        p.earliestCompletionTurn < 1
    )
  )
    throw new Error("Invalid housing stock or project pipeline");
}

export function advanceHousing(state: HousingState, input: HousingTurnInput): HousingState {
  validateHousingState(state);
  if (!count(input.turn) || input.turn < 1) throw new Error("Invalid housing turn");
  if (input.newProjects.length > MAX_HOUSING_PROJECTS)
    throw new Error("Housing project batch is too large");
  const inputKey = JSON.stringify([
    input.turn,
    input.population,
    input.constructionCashReceived,
    input.costPerCompletedDwelling,
    input.materialCapacity,
    input.laborCapacity,
    input.financeCapacity,
    input.planningCapacity,
    input.dwellingsLost,
    input.occupiedDwellingsLost,
    input.displacedPeople,
    input.vacatedDwellings,
    input.otherNewOccupancies,
    input.newlyUnhousedPeople,
    input.rehousingHouseholds,
    input.peoplePerRehousing,
    [...input.newProjects]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((p) => [p.id, p.dwellings, p.earliestCompletionTurn]),
  ]);
  // The board CAS owns partial-write recovery; a different input cannot finish
  // the same country turn with incompatible project stocks.
  if (state.asOfTurn === input.turn) {
    if (state.lastInputKey !== inputKey)
      throw new Error("Housing source changed during turn replay");
    return state;
  }
  if (state.asOfTurn !== input.turn - 1)
    throw new Error("Housing flow must advance exactly one turn");
  if (
    ![
      input.population,
      input.constructionCashReceived,
      input.costPerCompletedDwelling,
      input.materialCapacity,
      input.laborCapacity,
      input.financeCapacity,
      input.planningCapacity,
      input.dwellingsLost,
      input.occupiedDwellingsLost,
      input.displacedPeople,
      input.vacatedDwellings,
      input.otherNewOccupancies,
      input.newlyUnhousedPeople,
      input.rehousingHouseholds,
      input.peoplePerRehousing,
    ].every(count) ||
    input.population === 0 ||
    input.costPerCompletedDwelling === 0 ||
    input.peoplePerRehousing === 0 ||
    input.dwellingsLost > state.usableDwellings ||
    input.occupiedDwellingsLost > input.dwellingsLost ||
    input.occupiedDwellingsLost > state.occupiedDwellings ||
    input.dwellingsLost - input.occupiedDwellingsLost >
      state.usableDwellings - state.occupiedDwellings ||
    input.displacedPeople < input.occupiedDwellingsLost ||
    input.vacatedDwellings > state.occupiedDwellings - input.occupiedDwellingsLost ||
    input.newlyUnhousedPeople + state.unhousedPeople + input.displacedPeople > input.population
  )
    throw new Error("Invalid housing flow, costs or population exposure");
  const pipeline = [
    ...state.pipeline.map((p) => ({ ...p })),
    ...input.newProjects.map((p) => ({ ...p })),
  ];
  if (
    pipeline.length > MAX_HOUSING_PROJECTS ||
    new Set(pipeline.map((p) => p.id)).size !== pipeline.length ||
    input.newProjects.some(
      (p) =>
        !p.id ||
        !count(p.dwellings) ||
        p.dwellings === 0 ||
        !count(p.earliestCompletionTurn) ||
        p.earliestCompletionTurn <= input.turn
    )
  )
    throw new Error("New homes need a unique project and a future completion turn");
  let cash = state.constructionCash + input.constructionCashReceived;
  let room = Math.min(
    input.materialCapacity,
    input.laborCapacity,
    input.financeCapacity,
    input.planningCapacity,
    Math.floor(cash / input.costPerCompletedDwelling)
  );
  let completed = 0;
  for (const project of pipeline.sort(
    (a, b) => a.earliestCompletionTurn - b.earliestCompletionTurn || a.id.localeCompare(b.id)
  )) {
    if (project.earliestCompletionTurn > input.turn || room === 0) continue;
    const made = Math.min(project.dwellings, room);
    project.dwellings -= made;
    completed += made;
    room -= made;
    cash -= made * input.costPerCompletedDwelling;
  }
  const usableDwellings = state.usableDwellings + completed - input.dwellingsLost;
  let occupiedDwellings =
    state.occupiedDwellings - input.occupiedDwellingsLost - input.vacatedDwellings;
  occupiedDwellings += Math.min(input.otherNewOccupancies, usableDwellings - occupiedDwellings);
  const beforeRehousing = state.unhousedPeople + input.newlyUnhousedPeople + input.displacedPeople;
  const householdsRehoused = Math.min(
    input.rehousingHouseholds,
    usableDwellings - occupiedDwellings,
    Math.ceil(beforeRehousing / input.peoplePerRehousing)
  );
  const rehousedPeople = Math.min(beforeRehousing, householdsRehoused * input.peoplePerRehousing);
  occupiedDwellings += householdsRehoused;
  const next: HousingState = {
    ...state,
    asOfTurn: input.turn,
    usableDwellings,
    occupiedDwellings,
    unhousedPeople: beforeRehousing - rehousedPeople,
    constructionCash: cash,
    pipeline: pipeline.filter((p) => p.dwellings > 0),
    lastInputKey: inputKey,
    lastFlow: {
      completed,
      lost: input.dwellingsLost,
      openingStock: state.usableDwellings,
      spent: completed * input.costPerCompletedDwelling,
      rehousedPeople,
    },
  };
  validateHousingState(next);
  return next;
}

/** Landlord-paid assistance reduces costs; household cash assistance belongs in income, not here too. */
export function housingPaymentBurden(
  groups: readonly {
    id: string;
    households: number;
    annualDisposableIncome: number;
    annualHousingPayments: number;
    annualLandlordAssistance: number;
  }[]
) {
  if (
    !groups.length ||
    new Set(groups.map((g) => g.id)).size !== groups.length ||
    groups.some(
      (g) =>
        !g.id ||
        !Number.isFinite(g.households) ||
        g.households <= 0 ||
        ![g.annualDisposableIncome, g.annualHousingPayments, g.annualLandlordAssistance].every(
          (v) => Number.isFinite(v) && v >= 0
        ) ||
        g.annualLandlordAssistance > g.annualHousingPayments
    )
  )
    throw new Error("Invalid housing payment groups");
  let payments = 0,
    income = 0,
    burdenedHouseholds = 0,
    households = 0;
  for (const group of groups) {
    const net = group.annualHousingPayments - group.annualLandlordAssistance;
    payments += net * group.households;
    income += group.annualDisposableIncome * group.households;
    households += group.households;
    if (net > group.annualDisposableIncome * 0.3) burdenedHouseholds += group.households;
  }
  if (![payments, income, households].every(Number.isFinite))
    throw new Error("Housing payments overflow");
  return {
    payments,
    income,
    households,
    burdenedHouseholds,
    paymentBurden: income > 0 ? (100 * payments) / income : null,
    burdenedShare: (100 * burdenedHouseholds) / households,
  };
}
