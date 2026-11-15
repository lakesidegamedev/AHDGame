/** Producer plan and operating result shapes, with the small helpers shared across the production steps. */
import type { InternalTransferPricing } from "./internalTransferPricingRules";
import type { ProducerQuotePolicy } from "./rules";
import { laneKeyOf } from "./laneKey";

export interface PurchasedStock {
  commodity: string;
  units: number;
  /** Remaining acquisition value, in the same currency as market accounts. */
  value: number;
}

export interface ProducedStock {
  commodity: string;
  units: number;
  book: string;
  /** Historical quote memo only. Production expenses were already recognized. */
  quoteUnitCost?: number;
}

export interface ProductionPlan {
  id: string;
  internalTransferPricing?: { mode: InternalTransferPricing; discount?: number };
  /**
   * Opt in to own-site deliveries booked at market value (captiveMarketValue).
   * Unset for a company on Free transfer pricing, which books no entries.
   */
  ownSiteMarketValue?: boolean;
  /** The sector's opt-in to sell to outside buyers before the company's own plants. */
  sellOutsideFirst?: boolean;
  accountId: string;
  /** State the plant site is in; freight buys its own state's offers first. */
  stateId?: string;
  capacityUnits: number;
  activeFraction: number;
  /** Prior staffing, disasters and other physical constraints, excluding demand. */
  outputMultiplier: number;
  inputs: readonly {
    commodity: string;
    unitsPerOutput: number;
    book: string;
    maximumUnitPrice: number;
  }[];
  outputs: readonly {
    commodity: string;
    unitsPerOutput: number;
    book: string;
    policy: ProducerQuotePolicy;
    referenceUnitPrice: number;
    storable: boolean;
    /** Required for cost-plus sales of stock no longer made by this recipe. */
    retainedUnitCost?: number;
  }[];
  /** Cash payment for the active workforce, independent of realized sales. */
  labourCost: number;
  /** Explicit site, cold-capacity and regulatory costs, independent of product prices. */
  otherOperatingCost: number;
  /**
   * The part of otherOperatingCost owed with no run at all (cold upkeep on
   * idle capacity). When present, the site bill follows the run actually made
   * down to this floor; absent, the site bill is not trued up.
   */
  idleOperatingCost?: number;
  labourRecipientAccountId: string;
  operatingRecipientAccountId: string;
  inputStock: readonly PurchasedStock[];
  /** Already produced, unsold stock available beside current production. */
  outputStock: readonly ProducedStock[];
  /**
   * Units this plant sold last turn, for stock-cover markdown (stockCoverRules).
   * Absent means no markdown or write-down for this plant.
   */
  recentSoldUnits?: number;
  /** Units delivered per output last turn, keyed `${commodity}|${book}`; overrides the plant total. */
  recentSoldByOutput?: Readonly<Record<string, number>>;
  /** Own ask per output last turn, keyed like recentSoldByOutput (producerShortageAskStage >= 2). */
  recentAskByOutput?: Readonly<Record<string, number>>;
  /** Run share the demand plan chose, before input and cash cuts; echoed on the receipt. */
  plannedRunShare?: number;
  /** Consecutive glut turns before this one (producerRunPlanStage); echoed on the receipt. */
  priorGlutTurns?: number;
  /**
   * Revenue one unit of physical output is expected to earn, from last turn's
   * realized prices and sell-through (salesAdvanceRules). Lets a run be
   * financed against its own sales; absent or 0 = no sales advance.
   */
  expectedUnitRevenue?: number;
  /**
   * Consecutive restart probes before this turn that did not pay for
   * themselves (restartProbeRules), read from last turn's receipt.
   */
  restartProbeFailures?: number;
}

/** Why a plant made less than its planned run this turn, recorded on its receipt. */
export type RunCutReason = "cash" | "inputs";

/** Cold upkeep inside a plan's site bill: owed with no run at all. Absent = the whole bill. */
export function idleUpkeep(p: ProductionPlan): number {
  return p.idleOperatingCost != null
    ? Math.min(p.otherOperatingCost, Math.max(0, p.idleOperatingCost))
    : p.otherOperatingCost;
}

/**
 * What each company needs in cash to run its plants at full physical output
 * this turn: fixed bills (cold upkeep on its sites, owed with no run), plus
 * wages, the running part of the site bill and the inputs its stock does not
 * cover, priced at the bid ceiling. The settlement scales a company's run by
 * the share of this its free cash covers; the state operating advance sizes
 * itself from the same total so the two cannot drift.
 */
export function producerRunBudget(
  plans: readonly ProductionPlan[],
  /** Price per input unit; absent = the bid ceiling. */
  inputUnitPrice?: (recipe: ProductionPlan["inputs"][number]) => number
): {
  fixedBills: Map<string, number>;
  variableNeed: Map<string, number>;
} {
  const fixedBills = new Map<string, number>();
  const variableNeed = new Map<string, number>();
  for (const p of plans) {
    const full = p.capacityUnits * p.activeFraction * p.outputMultiplier;
    const idle = idleUpkeep(p);
    let spend = p.labourCost + (p.otherOperatingCost - idle);
    for (const recipe of p.inputs) {
      const stock = p.inputStock
        .filter((s) => s.commodity === recipe.commodity)
        .reduce((n, s) => n + s.units, 0);
      spend +=
        Math.max(0, full * recipe.unitsPerOutput - stock) *
        (inputUnitPrice ? inputUnitPrice(recipe) : recipe.maximumUnitPrice);
    }
    fixedBills.set(p.accountId, (fixedBills.get(p.accountId) ?? 0) + idle);
    variableNeed.set(
      p.accountId,
      (variableNeed.get(p.accountId) ?? 0) + finite(spend, "run budget")
    );
  }
  return { fixedBills, variableNeed };
}

export interface ProducerInputReservation {
  id: string;
  producerId: string;
  commodity: string;
  supplierOfferId: string;
  units: number;
  unitPrice: number;
}

export interface ProducerOperatingResult {
  id: string;
  /** Matching management-account entries between own sites; no treasury cash moves. */
  internalSupplyIncome?: number;
  internalSupplyCharge?: number;
  /** Own-site deliveries at the lane price, valuation only; they net to zero per company. */
  valuationCredit?: number;
  valuationCharge?: number;
  capacityUnits: number;
  activeUnits: number;
  /** Physical proposal before funded order matching constrains actual production. */
  plannedUnits: number;
  /** The plan's run share before input and cash cuts, read back by next turn's run rule. */
  plannedRunShare?: number;
  /** Consecutive glut turns before this turn, read back by the plan-recovery rule. */
  priorGlutTurns?: number;
  /** True when this turn's run was a restart probe financed against its own sales (restartProbeRules). */
  restartProbe?: boolean;
  /** Consecutive restart probes through this turn that did not pay for themselves; absent when 0. */
  restartProbeFailures?: number;
  /**
   * Share of the funded run that was actually made, when short inputs cut it:
   * wages and the running part of the site bill were billed on this share.
   * Absent when the plant made its whole funded run.
   */
  billedRunShare?: number;
  /** The scarcest major input when short inputs cut the run; set only with billedRunShare. */
  bindingInput?: string;
  /** Cold upkeep inside otherOperatingPaid plus arrears; not a cost of running. */
  idleOperatingCost?: number;
  /**
   * Why the plant made less than it planned: the company's cash could not fund
   * the whole run, or short inputs cut it. Next turn's demand plan reads a cut
   * run as a stoppage, not as weak demand. Absent when the run was not cut.
   */
  runCutBy?: RunCutReason[];
  producedUnits: number;
  offeredUnits: number;
  soldUnits: number;
  deliveredUnits: number;
  revenue: number;
  purchases: number;
  inputsConsumed: number;
  /**
   * Premium for minor-input units the plant ran without (makeDoRules.ts), paid
   * to the operating payee; any unpaid part is an operating payable. Absent when zero.
   */
  minorInputPremium?: number;
  /** Acquisition value lost from unused purchased inputs; not another cash charge. */
  inventoryWriteOff: number;
  labourPaid: number;
  otherOperatingPaid: number;
  labourArrears: number;
  otherOperatingArrears: number;
  operatingArrears: number;
  arrearsPaid: number;
  closingArrears: number;
  /** Purchases move cash into input stock; only consumption is an expense. */
  profit: number;
  /**
   * Inputs consumed by output that went to stock instead of a buyer this turn:
   * inventory at cost, not a loss. Reported beside profit, never moved as cash.
   * Output that could not be stored or was written down is lost, not stock, and
   * is left out.
   */
  unsoldProductionCost?: number;
  cashFlow: number;
  inputStock: PurchasedStock[];
  outputStock: ProducedStock[];
  /** Receipts on the same per-turn physical basis as purchases and inventory. */
  products: Array<{
    commodity: string;
    book: string;
    producedUnits: number;
    offeredUnits: number;
    soldUnits: number;
    internalDeliveredUnits: number;
    deliveredUnits: number;
    revenue: number;
    askingUnitPrice: number;
    /**
     * Value of own-site deliveries: what the company's short sites bid (stage
     * 2), otherwise the booked market value per unit (stage 3); absent otherwise.
     */
    captiveUnitValue?: number;
    /**
     * This plant's share of what the company's other sites asked for this good
     * this turn, filled from own supply or the market. Shared across the
     * company's plants of the good by active capacity. Absent when no own site
     * asked for it.
     */
    ownSiteDemandUnits?: number;
    realizedUnitPrice: number | null;
    unsoldUnits: number;
    lostUnits: number;
  }>;
}

export function finite(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${label}`);
  return value;
}

export type QuoteVolumes = Map<
  string,
  {
    levels: Map<number, number>;
    owners: Map<string, Map<number, number>>;
  }
>;

export function indexQuoteVolumes(
  rows: readonly {
    commodity: string;
    book: string;
    ownerId: string;
    unitPrice: number;
    units: number;
  }[]
): QuoteVolumes {
  const books: QuoteVolumes = new Map();
  for (const row of rows) {
    const key = laneKeyOf(row.commodity, row.book);
    const book = books.get(key) ?? { levels: new Map(), owners: new Map() };
    book.levels.set(row.unitPrice, (book.levels.get(row.unitPrice) ?? 0) + row.units);
    const owned = book.owners.get(row.ownerId) ?? new Map<number, number>();
    owned.set(row.unitPrice, (owned.get(row.unitPrice) ?? 0) + row.units);
    book.owners.set(row.ownerId, owned);
    books.set(key, book);
  }
  return books;
}

export function quoteVolumesExcept(
  books: QuoteVolumes,
  commodity: string,
  bookId: string,
  ownerId: string
) {
  const book = books.get(laneKeyOf(commodity, bookId));
  if (!book) return [];
  const owned = book.owners.get(ownerId);
  return [...book.levels].map(([unitPrice, total]) => ({
    unitPrice,
    units: Math.max(0, total - (owned?.get(unitPrice) ?? 0)),
  }));
}

/**
 * Joint production and delivery: shrink proposed production until every
 * recipe is backed by funded, delivered inputs. Each trial uses the same
 * opening cash and stock; no preview transfers money. Only a company on a
 * sales advance spends past its cash, and only what its own sales repay.
 */
/** Units an output sold last turn: its own row when the receipt has product rows, else the plant total. */
export function recentSoldOf(
  p: ProductionPlan,
  commodity: string,
  book: string
): number | undefined {
  if (p.recentSoldUnits == null) return undefined;
  return p.recentSoldByOutput
    ? (p.recentSoldByOutput[`${commodity}|${book}`] ?? 0)
    : p.recentSoldUnits;
}
