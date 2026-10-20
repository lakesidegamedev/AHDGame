/**
 * Household living standards share one disposable-income distribution.
 * resolveHouseholdResources subtracts taxes and adds paid cash, never services;
 * householdResourceOutcomes pools people before measuring poverty and inequality.
 */

export interface HouseholdResourceGroup {
  id: string;
  households: number;
  adults: number;
  children: number;
  /** Annual local-currency amounts per household, all for the same period. */
  marketIncome: number;
  paidCashTransfers: number;
  directTaxes: number;
  employeeContributions: number;
}

export interface HouseholdResourceInput {
  countryId: string;
  regionId: string;
  currency: string;
  priceBaseYear: number;
  measurementTurn: number;
  /** Local basket relative to priceBaseYear = 100; not an FX quote. */
  consumerPriceIndex: number;
  groups: readonly HouseholdResourceGroup[];
}

export interface HouseholdResourceCell {
  id: string;
  households: number;
  people: number;
  marketIncome: number;
  paidCashTransfers: number;
  directTaxes: number;
  employeeContributions: number;
  disposableIncome: number;
  equivalisedDisposableIncome: number;
  realEquivalisedDisposableIncome: number;
}

export interface HouseholdResourceReading {
  definitionVersion: 2;
  countryId: string;
  regionId: string;
  currency: string;
  priceBaseYear: number;
  measurementTurn: number;
  equivalenceScale: "square-root-household-size";
  cells: readonly HouseholdResourceCell[];
  totals: {
    households: number;
    people: number;
    marketIncome: number;
    paidCashTransfers: number;
    directTaxes: number;
    employeeContributions: number;
    disposableIncome: number;
  };
}

const nonnegative = (n: number) => Number.isFinite(n) && n >= 0;

/** No receipt is generated here: the host must supply already-paid cash amounts. */
export function resolveHouseholdResources(input: HouseholdResourceInput): HouseholdResourceReading {
  if (
    !input.countryId ||
    !input.regionId ||
    !input.currency ||
    !Number.isSafeInteger(input.priceBaseYear) ||
    input.priceBaseYear < 1 ||
    !Number.isSafeInteger(input.measurementTurn) ||
    input.measurementTurn < 1 ||
    !Number.isFinite(input.consumerPriceIndex) ||
    input.consumerPriceIndex <= 0 ||
    input.groups.length === 0 ||
    new Set(input.groups.map((g) => g.id)).size !== input.groups.length
  )
    throw new Error("Invalid household resource identity, window or basket");
  const cells = input.groups.map((group): HouseholdResourceCell => {
    if (
      !group.id ||
      !Number.isFinite(group.households) ||
      group.households <= 0 ||
      !Number.isSafeInteger(group.adults) ||
      group.adults < 0 ||
      !Number.isSafeInteger(group.children) ||
      group.children < 0 ||
      group.adults + group.children < 1 ||
      ![
        group.marketIncome,
        group.paidCashTransfers,
        group.directTaxes,
        group.employeeContributions,
      ].every(nonnegative)
    )
      throw new Error("Invalid household group or resource flow");
    const disposableIncome =
      group.marketIncome +
      group.paidCashTransfers -
      group.directTaxes -
      group.employeeContributions;
    // This model records paid deductions, not debt. A liability above available
    // resources belongs in a separate arrears account, not an invented cash loss.
    if (disposableIncome < 0) throw new Error("Household deductions exceed available resources");
    const size = group.adults + group.children;
    const equivalisedDisposableIncome = disposableIncome / Math.sqrt(size);
    const realEquivalisedDisposableIncome =
      (equivalisedDisposableIncome * 100) / input.consumerPriceIndex;
    if (![equivalisedDisposableIncome, realEquivalisedDisposableIncome].every(nonnegative))
      throw new Error("Household equivalised resources overflow");
    return {
      id: group.id,
      households: group.households,
      people: group.households * size,
      marketIncome: group.marketIncome,
      paidCashTransfers: group.paidCashTransfers,
      directTaxes: group.directTaxes,
      employeeContributions: group.employeeContributions,
      disposableIncome,
      equivalisedDisposableIncome,
      realEquivalisedDisposableIncome,
    };
  });
  const totals = {
    households: 0,
    people: 0,
    marketIncome: 0,
    paidCashTransfers: 0,
    directTaxes: 0,
    employeeContributions: 0,
    disposableIncome: 0,
  };
  for (const cell of cells) {
    totals.households += cell.households;
    totals.people += cell.people;
    for (const key of [
      "marketIncome",
      "paidCashTransfers",
      "directTaxes",
      "employeeContributions",
      "disposableIncome",
    ] as const)
      totals[key] += cell[key] * cell.households;
  }
  if (!Object.values(totals).every(nonnegative)) throw new Error("Household totals overflow");
  return {
    definitionVersion: 2,
    countryId: input.countryId,
    regionId: input.regionId,
    currency: input.currency,
    priceBaseYear: input.priceBaseYear,
    measurementTurn: input.measurementTurn,
    equivalenceScale: "square-root-household-size",
    cells,
    totals,
  };
}

function weightedMedian(cells: readonly { value: number; weight: number }[]): number {
  const sorted = [...cells].sort((a, b) => a.value - b.value);
  const half = sorted.reduce((sum, c) => sum + c.weight, 0) / 2;
  let count = 0;
  for (let i = 0; i < sorted.length; i++) {
    count += sorted[i]!.weight;
    if (count >= half)
      return count === half && i + 1 < sorted.length
        ? sorted[i]!.value / 2 + sorted[i + 1]!.value / 2
        : sorted[i]!.value;
  }
  throw new Error("Household distribution has no median");
}

function gini(cells: readonly HouseholdResourceCell[]): number | null {
  const people = cells.reduce((sum, c) => sum + c.people, 0);
  const income = cells.reduce((sum, c) => sum + c.people * c.equivalisedDisposableIncome, 0);
  if (!(income > 0)) return null;
  let incomeShare = 0,
    twiceArea = 0;
  for (const cell of [...cells].sort(
    (a, b) => a.equivalisedDisposableIncome - b.equivalisedDisposableIncome
  )) {
    const nextIncomeShare = incomeShare + (cell.people * cell.equivalisedDisposableIncome) / income;
    twiceArea += (cell.people / people) * (incomeShare + nextIncomeShare);
    incomeShare = nextIncomeShare;
  }
  return Math.max(0, Math.min(100, 100 * (1 - twiceArea)));
}

function poverty(cells: readonly HouseholdResourceCell[], threshold: number) {
  const people = cells.reduce((sum, c) => sum + c.people, 0);
  if (!(threshold > 0)) return { poorPeople: null, rate: null, gap: null };
  const poorPeople = cells.reduce(
    (sum, c) => sum + (c.equivalisedDisposableIncome < threshold ? c.people : 0),
    0
  );
  const gap = cells.reduce(
    (sum, c) =>
      sum + (c.people * Math.max(0, threshold - c.equivalisedDisposableIncome)) / threshold,
    0
  );
  return { poorPeople, rate: (100 * poorPeople) / people, gap: (100 * gap) / people };
}

/** National thresholds use pooled nominal resources; local prices affect purchasing power separately. */
export function householdResourceOutcomes(
  readings: readonly HouseholdResourceReading[],
  anchor?: { realThreshold: number; priceBaseYear: number }
) {
  const first = readings[0];
  if (
    !first ||
    new Set(readings.map((r) => r.regionId)).size !== readings.length ||
    readings.some(
      (r) =>
        r.countryId !== first.countryId ||
        r.currency !== first.currency ||
        r.measurementTurn !== first.measurementTurn ||
        r.priceBaseYear !== first.priceBaseYear ||
        r.definitionVersion !== 2 ||
        r.equivalenceScale !== first.equivalenceScale ||
        !r.cells.length ||
        r.cells.some(
          (c) =>
            !Number.isFinite(c.people) ||
            c.people <= 0 ||
            !nonnegative(c.equivalisedDisposableIncome) ||
            !nonnegative(c.realEquivalisedDisposableIncome)
        )
    )
  )
    throw new Error("Household aggregation needs distinct, compatible regional measurements");
  const cells = readings.flatMap((r) => r.cells);
  const totalPeople = cells.reduce((sum, c) => sum + c.people, 0);
  const totalIncome = cells.reduce((sum, c) => sum + c.people * c.equivalisedDisposableIncome, 0);
  if (
    !Number.isFinite(totalPeople) ||
    !Number.isFinite(totalIncome) ||
    (anchor &&
      (!(anchor.realThreshold > 0) ||
        !Number.isFinite(anchor.realThreshold) ||
        anchor.priceBaseYear !== first.priceBaseYear))
  )
    throw new Error("Invalid household totals or real poverty anchor");
  const median = weightedMedian(
    cells.map((c) => ({ value: c.equivalisedDisposableIncome, weight: c.people }))
  );
  const realMedian = weightedMedian(
    cells.map((c) => ({ value: c.realEquivalisedDisposableIncome, weight: c.people }))
  );
  const threshold50 = median * 0.5;
  const threshold60 = median * 0.6;
  return {
    countryId: first.countryId,
    currency: first.currency,
    measurementTurn: first.measurementTurn,
    median,
    realMedian,
    gini: gini(cells),
    threshold50,
    threshold60,
    poverty50: poverty(cells, threshold50),
    poverty60: poverty(cells, threshold60),
    anchoredPoverty: anchor
      ? poverty(
          cells.map((c) => ({
            ...c,
            equivalisedDisposableIncome: c.realEquivalisedDisposableIncome,
          })),
          anchor.realThreshold
        )
      : null,
    regions: readings.map((r) => ({
      regionId: r.regionId,
      poverty50: poverty(r.cells, threshold50),
      poverty60: poverty(r.cells, threshold60),
    })),
  };
}

/** Distribute one confirmed cash-transfer pool exactly once; no eligible group means no payment. */
export function allocateHouseholdCash(input: {
  paidPool: number;
  recipients: readonly { id: string; households: number; eligibility: number }[];
}) {
  if (
    !nonnegative(input.paidPool) ||
    new Set(input.recipients.map((r) => r.id)).size !== input.recipients.length ||
    input.recipients.some(
      (r) => !r.id || !nonnegative(r.households) || !nonnegative(r.eligibility) || r.eligibility > 1
    )
  )
    throw new Error("Invalid household cash allocation");
  const eligible = input.recipients.reduce((sum, r) => sum + r.households * r.eligibility, 0);
  if (!Number.isFinite(eligible)) throw new Error("Household recipient weights overflow");
  const allocations = input.recipients.map((r) => ({
    id: r.id,
    perHousehold: eligible > 0 ? (input.paidPool * r.eligibility) / eligible : 0,
  }));
  if (allocations.some((a) => !nonnegative(a.perHousehold)))
    throw new Error("Household cash allocation overflows");
  return {
    allocations,
    allocated: eligible > 0 ? input.paidPool : 0,
    unallocated: eligible > 0 ? 0 : input.paidPool,
  };
}
