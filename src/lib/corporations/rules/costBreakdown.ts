/**
 * Where a company's operating costs went on one turn, and what moved them.
 *
 * The turn records these parts beside the total so a later screen can name the
 * drivers of a cost change from recorded data alone. Plain data in, plain data
 * out; money is per turn in whatever currency the caller uses throughout.
 */

/** Cost legs one site reports for the turn. Anything not named here lands in "other". */
export interface SiteCostParts {
  wages: number;
  inputs: number;
  /** The site's running bill: upkeep, rent, insurance and similar. */
  maintenance: number;
  /** Group size costs charged on the site's revenue. */
  managementOverhead: number;
  /** Extra running cost in a state the company dominates. */
  dominanceCost: number;
  freight: number;
}

/** The recorded split of a company's operating costs. The parts sum to the total. */
export interface CostBreakdown extends SiteCostParts {
  /** Marketing, logistics, R&D and CEO pay. */
  budgets: number;
  /** Growth spend, compliance, carrying costs and anything else, so the parts sum to the total. */
  other: number;
}

export type CostCategory = keyof CostBreakdown;

export const COST_CATEGORIES: readonly CostCategory[] = [
  "wages",
  "inputs",
  "maintenance",
  "managementOverhead",
  "dominanceCost",
  "freight",
  "budgets",
  "other",
];

export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  wages: "Wages",
  inputs: "Inputs",
  maintenance: "Maintenance",
  managementOverhead: "Management overhead",
  dominanceCost: "Dominance cost",
  freight: "Freight",
  budgets: "Marketing, logistics, R&D and CEO pay",
  other: "Other costs",
};

const finite = (x: number | null | undefined): number =>
  typeof x === "number" && Number.isFinite(x) ? x : 0;

export function emptySiteCostParts(): SiteCostParts {
  return { wages: 0, inputs: 0, maintenance: 0, managementOverhead: 0, dominanceCost: 0, freight: 0 };
}

export function addSiteCostParts(into: SiteCostParts, part: Partial<SiteCostParts>): void {
  into.wages += finite(part.wages);
  into.inputs += finite(part.inputs);
  into.maintenance += finite(part.maintenance);
  into.managementOverhead += finite(part.managementOverhead);
  into.dominanceCost += finite(part.dominanceCost);
  into.freight += finite(part.freight);
}

/** Company breakdown from summed site parts, the company-level budgets and the recorded total. */
export function buildCostBreakdown(
  sites: SiteCostParts,
  budgets: number,
  totalCosts: number
): CostBreakdown {
  const named =
    sites.wages +
    sites.inputs +
    sites.maintenance +
    sites.managementOverhead +
    sites.dominanceCost +
    sites.freight +
    finite(budgets);
  return { ...sites, budgets: finite(budgets), other: finite(totalCosts) - named };
}

/** The same breakdown with every part passed through `convert` (currency conversion, rounding). */
export function mapCostBreakdown(
  breakdown: CostBreakdown,
  convert: (amount: number) => number
): CostBreakdown {
  return {
    wages: convert(breakdown.wages),
    inputs: convert(breakdown.inputs),
    maintenance: convert(breakdown.maintenance),
    managementOverhead: convert(breakdown.managementOverhead),
    dominanceCost: convert(breakdown.dominanceCost),
    freight: convert(breakdown.freight),
    budgets: convert(breakdown.budgets),
    other: convert(breakdown.other),
  };
}

/** One recorded turn's costs as a driver comparison reads them. */
export interface CostDriverTurn {
  turn: number;
  totalCosts: number;
  costBreakdown?: CostBreakdown | null;
  headcount?: number | null;
}

export interface CostDriver {
  category: CostCategory;
  label: string;
  before: number;
  after: number;
  /** Fractional change, 0.46 for +46%; null when the category was zero before. */
  change: number | null;
  /** Headcount move behind a wage change, when both turns recorded it. */
  headcount: { before: number; after: number } | null;
}

/** A cost change smaller than this is not worth naming. */
export const COST_CHANGE_THRESHOLD = 0.1;
const MAX_DRIVERS = 3;

/**
 * Main drivers of a total-cost change of 10% or more: the categories that moved
 * the total most, largest first. Empty when the change is small or either turn
 * has no recorded categories, so the caller falls back to the total-only message.
 */
export function costDrivers(previous: CostDriverTurn, latest: CostDriverTurn): CostDriver[] {
  const before = previous.costBreakdown;
  const after = latest.costBreakdown;
  if (!before || !after) return [];
  if (!(previous.totalCosts > 0)) return [];
  const totalChange = (latest.totalCosts - previous.totalCosts) / previous.totalCosts;
  if (Math.abs(totalChange) < COST_CHANGE_THRESHOLD) return [];
  const direction = Math.sign(totalChange);
  const staff =
    previous.headcount != null &&
    latest.headcount != null &&
    previous.headcount > 0 &&
    latest.headcount > 0
      ? { before: previous.headcount, after: latest.headcount }
      : null;
  const totalMove = Math.abs(latest.totalCosts - previous.totalCosts);
  const moves = COST_CATEGORIES.map((category) => ({
    category,
    before: finite(before[category]),
    after: finite(after[category]),
  }))
    .map((m) => ({ ...m, delta: m.after - m.before }))
    .filter((m) => Math.sign(m.delta) === direction && Math.abs(m.delta) >= totalMove * 0.1)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
    .slice(0, MAX_DRIVERS);
  return moves.map((m) => ({
    category: m.category,
    label: COST_CATEGORY_LABELS[m.category],
    before: m.before,
    after: m.after,
    change: m.before > 0 ? m.delta / m.before : null,
    headcount: m.category === "wages" ? staff : null,
  }));
}

/**
 * One plain line for a driver: "Wages up 46%, headcount 1,505 to 2,070". `fmt` formats money
 * for a category that was zero the turn before, where a percentage has no meaning.
 */
export function describeCostDriver(driver: CostDriver, fmt: (amount: number) => string): string {
  const move =
    driver.change == null
      ? `${fmt(driver.before)} to ${fmt(driver.after)}`
      : `${driver.change >= 0 ? "up" : "down"} ${Math.abs(Math.round(driver.change * 100))}%`;
  const crew = driver.headcount
    ? `, headcount ${driver.headcount.before.toLocaleString("en-US")} to ${driver.headcount.after.toLocaleString("en-US")}`
    : "";
  return `${driver.label} ${move}${crew}`;
}
