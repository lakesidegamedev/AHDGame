/**
 * Plants turn purchased inputs and paid work into deliverable output.
 * Input shortages constrain the whole recipe; purchases and consumed stock
 * retain their receipt cost instead of being billed again at a reference price.
 */
import {
  cappedStockUnitCost,
  markdownFactor,
  markedDownAsk,
  stockCover,
  writeDownUnits,
} from "./stockCoverRules";
import {
  quoteProducer,
  settleProducerMarket,
  type MarketAccount,
  type ProducerOffer,
  type ProducerQuotePolicy,
  type ProducerTradeReceipt,
  type PurchaseOrder,
} from "./rules";
import {
  accrueProducerPayable,
  settlePriorProducerPayables,
  type ProducerPayable,
} from "./payablesRules";
import {
  creditRunShare,
  payablesNotShrinkingSince,
  producerCreditHeadroom,
  type ProducerCreditPolicy,
} from "./producerCreditRules";
import { COMMODITY_SPOILAGE_PER_TURN } from "../inventory";
import { householdPurchaseOrders } from "./householdRules";
import { makeDoOutput, minorInputShortfallCost, minorInputs } from "./makeDoRules";
import { feasibleProduction } from "./productionFeasibilityRules";
import { spilloverOrders } from "./spilloverRules";
import { laneKeyOf } from "./laneKey";
import { deferredBillFraction, salesAdvanceAmount, salesFundedRunShare } from "./salesAdvanceRules";

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
  accountId: string;
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
  /** Previously produced, unsold stock available beside current production. */
  outputStock: readonly ProducedStock[];
  /**
   * Units this plant sold last turn, for stock-cover markdown (stockCoverRules).
   * Absent means no markdown or write-down for this plant.
   */
  recentSoldUnits?: number;
  /** Units delivered per output last turn, keyed `${commodity}|${book}`; overrides the plant total. */
  recentSoldByOutput?: Readonly<Record<string, number>>;
  /** Run share the demand plan chose, before input and cash cuts; echoed on the receipt. */
  plannedRunShare?: number;
  /**
   * Revenue one unit of physical output is expected to earn, from last turn's
   * realized prices and sell-through (salesAdvanceRules). Lets a run be
   * financed against its own sales; absent or 0 = no sales advance.
   */
  expectedUnitRevenue?: number;
}

/** Why a plant made less than its planned run this turn, recorded on its receipt. */
export type RunCutReason = "cash" | "inputs";

/** Cold upkeep inside a plan's site bill: owed with no run at all. Absent = the whole bill. */
function idleUpkeep(p: ProductionPlan): number {
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
export function producerRunBudget(plans: readonly ProductionPlan[]): {
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
      spend += Math.max(0, full * recipe.unitsPerOutput - stock) * recipe.maximumUnitPrice;
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
  capacityUnits: number;
  activeUnits: number;
  /** Physical proposal before funded order matching constrains actual production. */
  plannedUnits: number;
  /** The plan's run share before input and cash cuts, read back by next turn's run rule. */
  plannedRunShare?: number;
  /**
   * Share of the funded run that was actually made, when short inputs cut it:
   * wages and the running part of the site bill were billed on this share.
   * Absent when the plant made its whole funded run.
   */
  billedRunShare?: number;
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
    realizedUnitPrice: number | null;
    unsoldUnits: number;
    lostUnits: number;
  }>;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${label}`);
  return value;
}

type QuoteVolumes = Map<
  string,
  {
    levels: Map<number, number>;
    owners: Map<string, Map<number, number>>;
  }
>;

function indexQuoteVolumes(
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

function quoteVolumesExcept(
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
function recentSoldOf(p: ProductionPlan, commodity: string, book: string): number | undefined {
  if (p.recentSoldUnits == null) return undefined;
  return p.recentSoldByOutput
    ? (p.recentSoldByOutput[`${commodity}|${book}`] ?? 0)
    : p.recentSoldUnits;
}

export function advanceProducerEconomy(input: {
  turn: number;
  accounts: readonly MarketAccount[];
  payables?: readonly ProducerPayable[];
  producers: readonly ProductionPlan[];
  externalOffers?: readonly ProducerOffer[];
  externalOrders?: readonly PurchaseOrder[];
  inputReservations?: readonly ProducerInputReservation[];
  households?: readonly Omit<Parameters<typeof householdPurchaseOrders>[0], "cash">[];
  /** Explicit route/scope eligibility; missing entries allow only the offer's own book. */
  eligibleOffersByOrder?: Readonly<Record<string, readonly string[]>>;
  maximumPlanningPasses?: number;
  /**
   * Same-turn spillover of household spend stranded in sold-out lanes onto the
   * buyer's other lanes with unsold supply (spilloverRules). 0 or absent = off.
   */
  spilloverShare?: number;
  /** Explicit carry policy for alternate catalogs; ordinary worlds use commodity spoilage. */
  carryLossByCommodity?: Readonly<Record<string, number>>;
  /** Turns of recent sales a seller may carry before marking down (stockCoverRules); 0 or absent = off. */
  stockCoverTurns?: number;
  /** Country of a producing site, so offers and its input orders carry one. */
  countryOfProducer?: (producerId: string) => string | undefined;
  /** Build the per-country funded book on the final settlement (see fundedBookRules). */
  trackCountryBooks?: boolean;
  /** Private companies that may owe wages and site bills to keep running (producerCreditRules). */
  credit?: ProducerCreditPolicy;
}): {
  accounts: MarketAccount[];
  payables: ProducerPayable[];
  payablePayments: ProducerPayable[];
  producers: ProducerOperatingResult[];
  tradeReceipt: ProducerTradeReceipt;
  prices: ReturnType<typeof settleProducerMarket>["prices"];
  /** Units each buyer order asked for and received, for demand telemetry. */
  orderOutcomes: Array<{
    commodity: string;
    book: string;
    /** Buyer account, so demand can be placed where the buyer is. */
    accountId: string;
    requestedUnits: number;
    deliveredUnits: number;
  }>;
  /** Household spend stranded in sold-out lanes and how much the extra clearing placed. */
  spillover?: { strandedSpend: number; extraRequested: number; recovered: number };
  /** Per-country funded book from the settled clearing, when `trackCountryBooks` is on. */
  countryBooks?: ReturnType<typeof settleProducerMarket>["countryBooks"];
} {
  const carryRates: Readonly<Record<string, number>> =
    input.carryLossByCommodity ?? COMMODITY_SPOILAGE_PER_TURN;
  const countryOfProducer = input.countryOfProducer;
  const carryLoss = (commodity: string) => {
    const rate = carryRates[commodity] ?? 0;
    if (!Number.isFinite(rate) || rate < 0 || rate > 1)
      throw new Error("Invalid inventory carry loss");
    return rate;
  };
  const prior = settlePriorProducerPayables({
    accounts: input.accounts,
    payables: input.payables ?? [],
  });
  const closingPayables = new Map(prior.payables.map((claim) => [claim.id, claim]));
  const oldBillsPaidByProducer = new Map<string, number>();
  const oldBillsRemainingByProducer = new Map<string, number>();
  for (const payment of prior.payments) {
    const key = JSON.stringify([payment.debtorAccountId, payment.producerId]);
    oldBillsPaidByProducer.set(key, (oldBillsPaidByProducer.get(key) ?? 0) + payment.amount);
  }
  for (const claim of prior.payables) {
    const key = JSON.stringify([claim.debtorAccountId, claim.producerId]);
    oldBillsRemainingByProducer.set(
      key,
      (oldBillsRemainingByProducer.get(key) ?? 0) + claim.amount
    );
  }
  const producerIds = new Set<string>();
  const cash = new Map(prior.accounts.map((a) => [a.id, finite(a.cash, "opening operating cash")]));
  const pendingDueByAccount = new Map<string, number>();
  for (const claim of prior.payables)
    pendingDueByAccount.set(
      claim.debtorAccountId,
      (pendingDueByAccount.get(claim.debtorAccountId) ?? 0) + claim.amount
    );
  const heldForPayables = new Map<string, number>();
  // Wages and site bills a company chose to owe this turn on its credit line.
  // They are paid from later turns' cash, so they do not claim the cash it
  // keeps for the inputs of the run they staff.
  const creditDrawn = new Map<string, number>();
  const reserveUnpaidCash = () => {
    for (const [id, due] of pendingDueByAccount) {
      const held = heldForPayables.get(id) ?? 0;
      const added = Math.min(cash.get(id)!, Math.max(0, due - held - (creditDrawn.get(id) ?? 0)));
      cash.set(id, cash.get(id)! - added);
      heldForPayables.set(id, held + added);
    }
  };
  reserveUnpaidCash();
  const payments = new Map<string, { labour: number; operating: number; arrears: number }>();
  const offers: ProducerOffer[] = [...(input.externalOffers ?? [])];
  let plans = [...input.producers].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // Reserve fixed bills across a whole corporation pro rata, not by sector id.
  const bills = new Map<string, number>();
  for (const p of plans) {
    if (!p.id || producerIds.has(p.id)) throw new Error("Duplicate producer");
    producerIds.add(p.id);
    for (const id of [p.accountId, p.labourRecipientAccountId, p.operatingRecipientAccountId])
      if (!cash.has(id)) throw new Error("Missing operating account");
    finite(p.capacityUnits, "capacity");
    if (
      !Number.isFinite(p.activeFraction) ||
      p.activeFraction < 0 ||
      p.activeFraction > 1 ||
      !Number.isFinite(p.outputMultiplier) ||
      p.outputMultiplier < 0
    )
      throw new Error("Invalid capacity fraction");
    finite(p.capacityUnits * p.activeFraction * p.outputMultiplier, "physical output");
    if (p.expectedUnitRevenue != null) finite(p.expectedUnitRevenue, "expected unit revenue");
    bills.set(
      p.accountId,
      (bills.get(p.accountId) ?? 0) +
        finite(p.labourCost, "labour cost") +
        finite(p.otherOperatingCost, "operating cost")
    );
    const commodities = new Set<string>();
    for (const recipe of p.inputs) {
      if (commodities.has(recipe.commodity)) throw new Error("Duplicate input recipe");
      commodities.add(recipe.commodity);
      finite(recipe.unitsPerOutput, "input recipe");
      finite(recipe.maximumUnitPrice, "input limit");
    }
    for (const stock of p.inputStock) {
      finite(stock.units, "input stock");
      finite(stock.value, "stock value");
      if (stock.units === 0 && stock.value !== 0) throw new Error("Value without purchased units");
    }
    const outputCommodities = new Set<string>();
    for (const output of p.outputs) {
      if (outputCommodities.has(output.commodity)) throw new Error("Duplicate output recipe");
      outputCommodities.add(output.commodity);
      finite(output.unitsPerOutput, "output recipe");
      finite(output.referenceUnitPrice, "reference price");
      if (output.retainedUnitCost != null) finite(output.retainedUnitCost, "retained quote cost");
      if (
        output.unitsPerOutput === 0 &&
        output.policy.kind === "costPlus" &&
        output.retainedUnitCost == null
      )
        throw new Error("Retained cost-plus stock requires a recorded unit cost");
    }
    for (const stock of p.outputStock) {
      finite(stock.units, "output stock");
      if (stock.quoteUnitCost != null) finite(stock.quoteUnitCost, "stock quote cost");
      // An empty row (a good the plant no longer makes and has sold out of) is
      // harmless; only stock that exists must match an output and its book.
      if (
        stock.units > 0 &&
        (!outputCommodities.has(stock.commodity) ||
          !p.outputs.some(
            (output) => output.commodity === stock.commodity && output.book === stock.book
          ))
      )
        throw new Error(
          `Unrecognized produced stock or market book: ${p.id} ${stock.commodity} ${stock.book} (outputs ${p.outputs.map((o) => `${o.commodity}@${o.book}`).join(",")})`
        );
    }
  }
  // Budget the run, not just the payroll. Cold upkeep on the sites is the
  // fixed cost of owning plants and is paid first. Wages, the running part of
  // the site bill and inputs scale with the share of the plants the remaining
  // cash can staff and supply (inputs at the bid ceiling), so a company short
  // of cash runs smaller instead of paying every wage with nothing left for
  // materials, and owes no wages or running costs for a run that never happened.
  const { fixedBills, variableNeed } = producerRunBudget(plans);
  // A private company on the credit line may run past its cash: it buys the
  // inputs with cash and owes the wages and site bills it cannot cover, up to
  // its headroom (producerCreditRules). `inputReserve` is the cash kept back
  // for those inputs; only companies that actually draw credit get one.
  const creditAccounts = new Set(input.credit?.accountIds ?? []);
  // Wages plus site running costs at a full run: the bills a company may owe.
  const fullRunningBills = new Map<string, number>();
  // What a full run is expected to earn, for the sales advance (salesAdvanceRules).
  const expectedRevenue = new Map<string, number>();
  for (const p of plans) {
    fullRunningBills.set(
      p.accountId,
      (fullRunningBills.get(p.accountId) ?? 0) + p.labourCost + p.otherOperatingCost - idleUpkeep(p)
    );
    if ((p.expectedUnitRevenue ?? 0) > 0)
      expectedRevenue.set(
        p.accountId,
        (expectedRevenue.get(p.accountId) ?? 0) +
          p.capacityUnits * p.activeFraction * p.outputMultiplier * p.expectedUnitRevenue!
      );
  }
  const notShrinkingSince = new Map<string, number>();
  for (const claim of prior.payables)
    if (claim.notShrinkingSince != null)
      notShrinkingSince.set(
        claim.debtorAccountId,
        Math.min(
          notShrinkingSince.get(claim.debtorAccountId) ?? claim.notShrinkingSince,
          claim.notShrinkingSince
        )
      );
  const inputReserve = new Map<string, number>();
  // Cash a company borrows against this turn's own sales to fund its run.
  const salesAdvance = new Map<string, number>();
  const runShare = new Map(
    [...bills.keys()].map((id) => {
      const need = variableNeed.get(id) ?? 0;
      const free = Math.max(0, cash.get(id)! - (fixedBills.get(id) ?? 0));
      const cashOnly = need > 0 ? Math.min(1, free / need) : 1;
      if (cashOnly >= 1) return [id, cashOnly];
      // Sales fund the run: a run that earns more than it costs is not held
      // back by the cash the company happens to hold at the open.
      const salesFunded = Math.max(
        cashOnly,
        salesFundedRunShare({ free, need, expectedRevenue: expectedRevenue.get(id) ?? 0 })
      );
      const advance = () => {
        const amount = salesAdvanceAmount({ free, need, runShare: salesFunded });
        if (salesFunded > cashOnly * (1 + 1e-12) + 1e-15 && amount > 0)
          salesAdvance.set(id, amount);
        return [id, salesFunded] as const;
      };
      if (!creditAccounts.has(id) || salesFunded >= 1) return advance();
      const labour = fullRunningBills.get(id) ?? 0;
      const inputs = Math.max(0, need - labour);
      const share = creditRunShare({
        cash: cash.get(id)!,
        fixedBills: fixedBills.get(id) ?? 0,
        labour,
        inputs,
        headroom: producerCreditHeadroom({
          turn: input.turn,
          billsAtFullRun: (fixedBills.get(id) ?? 0) + labour,
          outstanding: pendingDueByAccount.get(id) ?? 0,
          notShrinkingSince: notShrinkingSince.get(id),
          runTurns: input.credit?.runTurns,
          stuckTurns: input.credit?.stuckTurns,
        }),
      });
      if (!(share > salesFunded * (1 + 1e-12) + 1e-15)) return advance();
      if (share > cashOnly * (1 + 1e-12) + 1e-15) inputReserve.set(id, inputs * share);
      return [id, share] as const;
    })
  );
  // Wages and site running costs follow the run the company can fund; idle
  // capacity keeps its cold upkeep.
  plans = plans.map((p) => {
    const share = runShare.get(p.accountId) ?? 1;
    if (share >= 1) return p;
    const idle = idleUpkeep(p);
    return {
      ...p,
      labourCost: p.labourCost * share,
      otherOperatingCost: idle + (p.otherOperatingCost - idle) * share,
    };
  });
  bills.clear();
  for (const p of plans)
    bills.set(p.accountId, (bills.get(p.accountId) ?? 0) + p.labourCost + p.otherOperatingCost);
  const funding = new Map(
    [...bills].map(([id, bill]) => {
      const payable = Math.max(0, cash.get(id)! - (inputReserve.get(id) ?? 0));
      return [id, bill > 0 ? Math.min(1, payable / bill) : 1];
    })
  );
  // Wages and site bills a sales-advance company could not pay from cash at
  // the open. Its sales pay them before close; what they cannot stays owed.
  const deferredBills = new Map<string, number>();
  const credits = new Map<string, number>();
  for (const p of plans) {
    const fraction = funding.get(p.accountId)!;
    const labour = p.labourCost * fraction,
      operating = p.otherOperatingCost * fraction;
    cash.set(p.accountId, Math.max(0, cash.get(p.accountId)! - labour - operating));
    credits.set(
      p.labourRecipientAccountId,
      (credits.get(p.labourRecipientAccountId) ?? 0) + labour
    );
    credits.set(
      p.operatingRecipientAccountId,
      (credits.get(p.operatingRecipientAccountId) ?? 0) + operating
    );
    const owed = Math.max(0, p.labourCost - labour) + Math.max(0, p.otherOperatingCost - operating);
    pendingDueByAccount.set(p.accountId, (pendingDueByAccount.get(p.accountId) ?? 0) + owed);
    if (inputReserve.has(p.accountId) || salesAdvance.has(p.accountId))
      creditDrawn.set(p.accountId, (creditDrawn.get(p.accountId) ?? 0) + owed);
    if (salesAdvance.has(p.accountId))
      deferredBills.set(p.accountId, (deferredBills.get(p.accountId) ?? 0) + owed);
    payments.set(p.id, {
      labour,
      operating,
      arrears: Math.max(0, p.labourCost - labour) + Math.max(0, p.otherOperatingCost - operating),
    });
  }
  // Paid wages are actual income, not an invented household demand multiplier.
  for (const [id, amount] of credits) cash.set(id, cash.get(id)! + amount);
  reserveUnpaidCash();
  // The rest of the advance buys inputs on intra-turn credit, settled from the
  // run's sales in the clearing. A company whose sales fall short has its line
  // cut until it closes with cash (settleWithinCredit), never below zero.
  const inputCredit: Record<string, number> = {};
  for (const [id, amount] of salesAdvance) {
    const line = Math.max(0, amount - (deferredBills.get(id) ?? 0));
    if (line > 0) inputCredit[id] = line;
  }
  const householdIds = new Set<string>();
  let consumerOrders = [...(input.externalOrders ?? [])];
  for (const household of input.households ?? []) {
    if (householdIds.has(household.accountId) || !cash.has(household.accountId))
      throw new Error("Duplicate or unknown household wallet");
    householdIds.add(household.accountId);
    consumerOrders.push(
      ...householdPurchaseOrders({ ...household, cash: cash.get(household.accountId)! })
    );
  }
  const orders = [...consumerOrders];
  const originalCash = new Map(input.accounts.map((a) => [a.id, a.cash]));
  const plannedById = new Map(
    plans.map((p) => [
      p.id,
      p.capacityUnits *
        p.activeFraction *
        p.outputMultiplier *
        (runShare.get(p.accountId) ?? 1) *
        // A run on credit or on its own sales is fully staffed: what cash did
        // not pay is owed until the sales pay it.
        (inputReserve.has(p.accountId) || salesAdvance.has(p.accountId)
          ? 1
          : (funding.get(p.accountId) ?? 1)),
    ])
  );
  // Physical maximum per plant, before the feasibility pre-pass picks a start.
  const physicalMaximum = new Map(plannedById);
  // Find a physically feasible mix before buyers reserve inputs. Otherwise an
  // early final producer can take the energy needed by the steel supplier that
  // makes its own inputs, and a greedy shrink pass strands the entire cycle.
  // Each segment ends when one owned input is exhausted. Its marginal input
  // requirement is constant. This retains partial batches without ever treating
  // private purchased stock as a shared commodity endowment.
  const segments = plans.flatMap((p) => {
    const maximum = plannedById.get(p.id)!;
    const owned = new Map(
      p.inputs.map((r) => [
        r.commodity,
        p.inputStock
          .filter((s) => s.commodity === r.commodity)
          .reduce((sum, s) => sum + s.units, 0),
      ])
    );
    const boundaries = new Set([0, 1]);
    for (const r of p.inputs) {
      const required = maximum * r.unitsPerOutput;
      const fraction = required > 0 ? (owned.get(r.commodity) ?? 0) / required : 0;
      if (fraction > 0 && fraction < 1) boundaries.add(fraction);
    }
    const points = [...boundaries].sort((a, b) => a - b);
    return points.slice(1).map((to, j) => ({
      id: JSON.stringify([p.id, j]),
      plan: p,
      owned,
      from: points[j] * maximum,
      to: to * maximum,
      units: (to - points[j]) * maximum,
    }));
  });
  const resources = new Map<string, { available: number; coefficients: number[] }>();
  const resource = (commodity: string, book: string) => {
    const key = JSON.stringify([commodity, book]);
    let row = resources.get(key);
    if (!row) {
      row = { available: 0, coefficients: Array(segments.length).fill(0) };
      resources.set(key, row);
    }
    return row;
  };
  // Minor inputs do not limit the plan (makeDoRules.ts): a plant short of one
  // runs anyway and pays a premium for the missing units at settlement.
  const minorByPlan = new Map(
    plans.map((p) => [
      p.id,
      minorInputs(
        p.inputs.map((r) => ({ unitsPerOutput: r.unitsPerOutput, unitValue: r.maximumUnitPrice }))
      ),
    ])
  );
  for (const [j, segment] of segments.entries()) {
    const minor = minorByPlan.get(segment.plan.id)!;
    for (const [k, recipe] of segment.plan.inputs.entries()) {
      if (minor[k]) continue;
      const owned = segment.owned.get(recipe.commodity) ?? 0;
      resource(recipe.commodity, recipe.book).coefficients[j] +=
        Math.max(0, segment.to * recipe.unitsPerOutput - owned) -
        Math.max(0, segment.from * recipe.unitsPerOutput - owned);
    }
    for (const output of segment.plan.outputs)
      resource(output.commodity, output.book).coefficients[j] -=
        segment.units * output.unitsPerOutput;
  }
  for (const p of plans)
    for (const output of p.outputs)
      resource(output.commodity, output.book).available += p.outputStock
        .filter((s) => s.commodity === output.commodity && s.book === output.book)
        .reduce((sum, s) => sum + s.units, 0);
  for (const offer of input.externalOffers ?? [])
    resource(offer.commodity, offer.book).available += Math.min(
      offer.units,
      offer.deliverableUnits ?? offer.units
    );
  const feasible = feasibleProduction({
    activities: segments.map((s) => ({
      id: s.id,
      value:
        s.units *
        s.plan.outputs.reduce((sum, o) => sum + o.unitsPerOutput * o.referenceUnitPrice, 0),
    })),
    constraints: [...resources.values()],
  });
  for (const p of plans) plannedById.set(p.id, 0);
  for (const [j, segment] of segments.entries())
    plannedById.set(
      segment.plan.id,
      plannedById.get(segment.plan.id)! + segment.units * feasible[j]
    );
  const proposedById = new Map(plannedById);
  const reservations = new Map<string, ProducerInputReservation[]>();
  const plansById = new Map(plans.map((plan) => [plan.id, plan]));
  const reservationIds = new Set<string>();
  for (const reservation of input.inputReservations ?? []) {
    if (!reservation.id || reservationIds.has(reservation.id) || !reservation.supplierOfferId)
      throw new Error("Invalid input reservation identity");
    reservationIds.add(reservation.id);
    finite(reservation.units, "reserved units");
    finite(reservation.unitPrice, "reserved price");
    const plan = plansById.get(reservation.producerId);
    if (!plan?.inputs.some((recipe) => recipe.commodity === reservation.commodity))
      throw new Error("Input reservation has no matching recipe");
    const key = JSON.stringify([reservation.producerId, "input", reservation.commodity]);
    const rows = reservations.get(key) ?? [];
    rows.push(reservation);
    reservations.set(key, rows);
  }
  const orderIdsForInput = (producerId: string, commodity: string) => {
    const id = JSON.stringify([producerId, "input", commodity]);
    return [
      id,
      ...(reservations.get(id) ?? []).map((r) => JSON.stringify([id, "reservation", r.id])),
    ];
  };
  const inputOrders = (): PurchaseOrder[] =>
    plans.flatMap((p) =>
      p.inputs.flatMap((recipe) => {
        const stock = p.inputStock
          .filter((s) => s.commodity === recipe.commodity)
          .reduce((n, s) => n + s.units, 0);
        const id = JSON.stringify([p.id, "input", recipe.commodity]);
        const units = Math.max(0, plannedById.get(p.id)! * recipe.unitsPerOutput - stock);
        const reserved = reservations.get(id) ?? [];
        const quantityGroup = reserved.length ? { id, maximumUnits: units } : undefined;
        const publicOrder: PurchaseOrder = {
          id,
          accountId: p.accountId,
          commodity: recipe.commodity,
          book: recipe.book,
          units,
          maximumUnitPrice: recipe.maximumUnitPrice,
          priority: 1,
          eligibleOfferIds: input.eligibleOffersByOrder?.[id],
          ...(countryOfProducer?.(p.id) ? { countryId: countryOfProducer(p.id) } : {}),
          ...(quantityGroup ? { quantityGroup } : {}),
        };
        return [
          publicOrder,
          ...reserved.map((reservation): PurchaseOrder => {
            const reservedId = JSON.stringify([id, "reservation", reservation.id]);
            return {
              ...publicOrder,
              id: reservedId,
              units: Math.min(units, reservation.units),
              maximumUnitPrice: reservation.unitPrice,
              contractUnitPrice: reservation.unitPrice,
              supplierOfferId: reservation.supplierOfferId,
              eligibleOfferIds:
                input.eligibleOffersByOrder?.[reservedId] ?? publicOrder.eligibleOfferIds,
            };
          }),
        ];
      })
    );
  orders.push(...inputOrders());
  const pendingQuotes: Array<{
    offer: ProducerOffer;
    quote: Parameters<typeof quoteProducer>[0];
    markdown: { factor: number; reference: number };
  }> = [];
  const requestedSpend = new Map<string, number>();
  const groupedSpend = new Map<string, { accountId: string; maximumSpend: number }>();
  for (const order of orders) {
    if (order.quantityGroup) {
      const group = groupedSpend.get(order.quantityGroup.id);
      groupedSpend.set(order.quantityGroup.id, {
        accountId: order.accountId,
        maximumSpend: Math.max(
          group?.maximumSpend ?? 0,
          order.quantityGroup.maximumUnits * order.maximumUnitPrice
        ),
      });
      continue;
    }
    requestedSpend.set(
      order.accountId,
      (requestedSpend.get(order.accountId) ?? 0) +
        Math.min(order.units * order.maximumUnitPrice, order.maximumSpend ?? Number.MAX_VALUE)
    );
  }
  for (const group of groupedSpend.values())
    requestedSpend.set(
      group.accountId,
      (requestedSpend.get(group.accountId) ?? 0) + group.maximumSpend
    );
  // Aggregate identical limits once. Retaining one demand object per buyer
  // per seller makes an otherwise modest world use quadratic memory.
  const demandBooks = indexQuoteVolumes(
    orders
      .filter((order) => !order.supplierOfferId)
      .map((order) => ({
        commodity: order.commodity,
        book: order.book,
        ownerId: order.accountId,
        unitPrice: order.maximumUnitPrice,
        units:
          Math.min(
            order.units,
            order.maximumUnitPrice > 0
              ? (order.maximumSpend ?? Number.MAX_VALUE) / order.maximumUnitPrice
              : order.units
          ) *
          Math.min(
            1,
            ((cash.get(order.accountId) ?? 0) + (inputCredit[order.accountId] ?? 0)) /
              Math.max(Number.MIN_VALUE, requestedSpend.get(order.accountId) ?? 0)
          ),
      }))
  );
  for (const p of plans) {
    const fixed = p.labourCost + p.otherOperatingCost;
    const variablePerOutput = p.inputs.reduce(
      (n, r) => n + r.unitsPerOutput * r.maximumUnitPrice,
      0
    );
    const outputValue = p.outputs.reduce((n, r) => n + r.unitsPerOutput * r.referenceUnitPrice, 0);
    for (const output of p.outputs) {
      const stock = p.outputStock
        .filter((s) => s.commodity === output.commodity && s.book === output.book)
        .reduce((n, s) => n + s.units, 0);
      const units = stock + plannedById.get(p.id)! * output.unitsPerOutput;
      const weight =
        outputValue > 0 ? (output.unitsPerOutput * output.referenceUnitPrice) / outputValue : 0;
      const quoteInput = {
        policy: output.policy,
        referenceUnitPrice: output.referenceUnitPrice,
        variableUnitCost:
          output.unitsPerOutput > 0
            ? (variablePerOutput * weight) / output.unitsPerOutput
            : (output.retainedUnitCost ?? 0),
        fixedCost: fixed * weight,
        offeredUnits: units,
        demand: quoteVolumesExcept(demandBooks, output.commodity, output.book, p.accountId).map(
          (level) => ({ units: level.units, maximumUnitPrice: level.unitPrice })
        ),
        competitors: [],
      };
      const quote = quoteProducer({
        ...quoteInput,
        policy:
          output.policy.kind === "automatic"
            ? { kind: "manual", unitPrice: output.referenceUnitPrice }
            : output.policy,
      });
      const recentSold = recentSoldOf(p, output.commodity, output.book);
      const cover = recentSold != null ? stockCover(stock, recentSold) : 0;
      pendingQuotes.push({
        markdown: {
          factor: markdownFactor(cover, { coverTurns: input.stockCoverTurns ?? 0 }),
          reference: output.referenceUnitPrice,
        },
        offer: {
          id: JSON.stringify([p.id, "output", output.commodity]),
          accountId: p.accountId,
          commodity: output.commodity,
          book: output.book,
          units,
          unitPrice: quote.unitPrice,
          ...(countryOfProducer?.(p.id) ? { countryId: countryOfProducer(p.id) } : {}),
        },
        quote: quoteInput,
      });
    }
  }
  const openingOffers = [...offers, ...pendingQuotes.map((q) => q.offer)];
  const supplyBooks = indexQuoteVolumes(
    openingOffers.map((offer) => ({ ...offer, ownerId: offer.id }))
  );
  for (const pending of pendingQuotes) {
    const quote = quoteProducer({
      ...pending.quote,
      competitors: quoteVolumesExcept(
        supplyBooks,
        pending.offer.commodity,
        pending.offer.book,
        pending.offer.id
      ),
    });
    offers.push({
      ...pending.offer,
      unitPrice: markedDownAsk(
        quote.unitPrice,
        pending.markdown.reference,
        pending.markdown.factor
      ),
    });
  }
  const postedOffers = new Map(offers.map((o) => [o.id, o]));
  const trial = (track = false) => {
    const proposedOffers: ProducerOffer[] = [...(input.externalOffers ?? [])];
    for (const p of plans)
      for (const output of p.outputs) {
        const id = JSON.stringify([p.id, "output", output.commodity]);
        const stock = p.outputStock
          .filter((s) => s.commodity === output.commodity && s.book === output.book)
          .reduce((n, s) => n + s.units, 0);
        proposedOffers.push({
          ...postedOffers.get(id)!,
          units: stock + plannedById.get(p.id)! * output.unitsPerOutput,
        });
      }
    return settleProducerMarket({
      turn: input.turn,
      accounts: [...cash].map(([id, value]) => ({ id, cash: value })),
      offers: proposedOffers,
      orders: [...consumerOrders, ...inputOrders()],
      ...(track ? { trackCountryBooks: true } : {}),
      ...(Object.keys(inputCredit).length > 0 ? { credit: { ...inputCredit } } : {}),
    });
  };
  // Cut the input line of every company whose sales did not cover what it
  // bought on it; true when any line changed.
  const cutShortCredit = (settled: ReturnType<typeof settleProducerMarket>) => {
    let cut = false;
    for (const account of settled.accounts) {
      const line = inputCredit[account.id];
      if (line == null || !(account.cash < 0)) continue;
      const next = Math.max(0, line + account.cash * (1 + 1e-9) - 1e-9);
      if (next > 0) inputCredit[account.id] = next;
      else delete inputCredit[account.id];
      cut = true;
    }
    return cut;
  };
  // Settle at the current plan with every company closing on cash: a line its
  // sales did not cover is cut and the clearing repeated. Without credit no
  // buyer can spend past its cash, so the last resort always closes.
  const settleWithinCredit = (track = false) => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const settled = trial(track);
      if (!cutShortCredit(settled)) return settled;
    }
    for (const id of Object.keys(inputCredit)) delete inputCredit[id];
    return trial(track);
  };
  let market: ReturnType<typeof settleProducerMarket> | undefined;
  const passes = input.maximumPlanningPasses ?? 128;
  if (!Number.isSafeInteger(passes) || passes < 1 || passes > 1024)
    throw new Error("Invalid planning-pass limit");
  // Make do with short inputs (makeDoRules.ts): each pass reads every input's
  // fill rate at the current plan and sets output from its physical maximum, so
  // shortages settle at a proportional cut instead of compounding to zero.
  // Rises are damped; a run that has not settled keeps its last plan.
  // The pre-pass result is the starting plan: it allocates scarce inputs so
  // supplier cycles stay alive, and a plant it fed never rises above it (a
  // rise would starve that cycle). A plant it zeroed (its inputs net short, or
  // no local supplier) rises toward what make-do allows from its physical
  // maximum.
  const originalPlan = new Map(
    plans.map((p) => {
      const start = plannedById.get(p.id)!;
      return [p.id, start > 0 ? start : physicalMaximum.get(p.id)!] as const;
    })
  );
  // A zeroed plant tries: it orders at its physical maximum on the first pass
  // and settles by fill rate like everyone else.
  for (const p of plans)
    if (!(plannedById.get(p.id)! > 0)) plannedById.set(p.id, physicalMaximum.get(p.id)!);
  for (let pass = 0; pass < passes; pass++) {
    market = trial();
    const bought = new Map(market.orders.map((o) => [o.id, o.deliveredUnits]));
    let changed = cutShortCredit(market);
    for (const p of plans) {
      const previous = plannedById.get(p.id)!;
      const fills = p.inputs.map((recipe) => {
        const stock = p.inputStock
          .filter((s) => s.commodity === recipe.commodity)
          .reduce((n, s) => n + s.units, 0);
        const have =
          stock +
          orderIdsForInput(p.id, recipe.commodity).reduce(
            (sum, id) => sum + (bought.get(id) ?? 0),
            0
          );
        const need = previous * recipe.unitsPerOutput;
        return {
          unitsPerOutput: recipe.unitsPerOutput,
          unitValue: recipe.maximumUnitPrice,
          // A plan already at zero ordered nothing; it stays at zero.
          fill: need > 0 ? Math.min(1, have / need) : previous > 0 ? 1 : 0,
        };
      });
      const target = makeDoOutput(originalPlan.get(p.id)!, fills);
      // Falls apply at once; rises are damped so the cycle settles.
      const damped = target <= previous ? target : (previous + target) / 2;
      // A plan that has decayed to a negligible share of the original is zero.
      const next = damped < originalPlan.get(p.id)! * 1e-9 ? 0 : damped;
      if (Math.abs(next - previous) > Math.max(1e-9, previous * 1e-4)) changed = true;
      plannedById.set(p.id, Math.max(0, Math.min(originalPlan.get(p.id)!, next)));
    }
    if (!changed) break;
  }
  // Bills follow output (owner decision 2026-10-30). Wages and site running
  // costs were sized and paid for the funded run, before short inputs cut it.
  // The plant pays for the share it made; idle capacity keeps its cold upkeep.
  // The unused share goes back to the company before the final clearing, so no
  // household spends wages that were never earned. Cash cuts and productivity
  // are in the funded run already and are billed as before.
  const billedRunShare = new Map<string, number>();
  for (const [i, p] of plans.entries()) {
    const maximum = physicalMaximum.get(p.id)!;
    const share = maximum > 0 ? Math.min(1, Math.max(0, plannedById.get(p.id)! / maximum)) : 1;
    if (!(share < 1 - 1e-12)) continue;
    billedRunShare.set(p.id, share);
    const paid = payments.get(p.id)!;
    const refund = (recipient: string, amount: number) => {
      const taken = Math.min(cash.get(recipient)!, Math.max(0, amount));
      cash.set(recipient, cash.get(recipient)! - taken);
      cash.set(p.accountId, cash.get(p.accountId)! + taken);
      return taken;
    };
    const labourArrears = Math.max(0, p.labourCost - paid.labour);
    const labour = paid.labour - refund(p.labourRecipientAccountId, paid.labour * (1 - share));
    const idle =
      p.idleOperatingCost != null
        ? Math.min(p.otherOperatingCost, Math.max(0, finite(p.idleOperatingCost, "idle upkeep")))
        : null;
    const operatingRatio =
      idle != null && p.otherOperatingCost > 0
        ? (idle + (p.otherOperatingCost - idle) * share) / p.otherOperatingCost
        : 1;
    const operatingArrears = Math.max(0, p.otherOperatingCost - paid.operating);
    const operating =
      paid.operating - refund(p.operatingRecipientAccountId, paid.operating * (1 - operatingRatio));
    const arrearsCut = labourArrears * (1 - share) + operatingArrears * (1 - operatingRatio);
    pendingDueByAccount.set(
      p.accountId,
      Math.max(0, (pendingDueByAccount.get(p.accountId) ?? 0) - arrearsCut)
    );
    payments.set(p.id, {
      labour,
      operating,
      arrears: paid.arrears - arrearsCut,
    });
    plans[i] = {
      ...p,
      labourCost: labour + labourArrears * share,
      otherOperatingCost: operating + operatingArrears * operatingRatio,
    };
  }
  if (billedRunShare.size > 0 && householdIds.size > 0)
    consumerOrders = [
      ...(input.externalOrders ?? []),
      ...(input.households ?? []).flatMap((household) =>
        householdPurchaseOrders({ ...household, cash: cash.get(household.accountId)! })
      ),
    ];
  // Clear once more at the settled plan so every sale is backed by what is
  // actually produced (the last pass may have lowered plans after clearing).
  market = settleWithinCredit(input.trackCountryBooks === true);
  if (!market) throw new Error("Missing producer market settlement");
  let spillover: { strandedSpend: number; extraRequested: number; recovered: number } | undefined;
  if ((input.spilloverShare ?? 0) > 0 && householdIds.size > 0) {
    const offerLane = new Map(
      [...(input.externalOffers ?? []), ...offers].map((o) => [
        o.id,
        laneKeyOf(o.commodity, o.book),
      ])
    );
    const unsoldUnits = new Map<string, number>();
    for (const o of market.offers) {
      const lane = offerLane.get(o.id);
      if (lane)
        unsoldUnits.set(lane, (unsoldUnits.get(lane) ?? 0) + (o.offeredUnits - o.deliveredUnits));
    }
    const first = new Map(
      market.orders.map((o) => [o.id, { cost: o.cost, deliveredUnits: o.deliveredUnits }])
    );
    const next = spilloverOrders({
      orders: consumerOrders,
      accounts: householdIds,
      outcomes: first,
      unsoldUnits,
      laneKey: laneKeyOf,
      share: input.spilloverShare as number,
    });
    if (next.stats.extraRequested > 0) {
      const spend = (orders: ReturnType<typeof settleProducerMarket>["orders"]) => {
        const ids = new Set(
          consumerOrders.filter((o) => householdIds.has(o.accountId)).map((o) => o.id)
        );
        return orders.filter((o) => ids.has(o.id)).reduce((sum, o) => sum + o.cost, 0);
      };
      const before = spend(market.orders);
      consumerOrders = next.orders;
      market = settleWithinCredit(input.trackCountryBooks === true);
      spillover = { ...next.stats, recovered: spend(market.orders) - before };
    }
  }
  const results: ProducerOperatingResult[] = [];
  const offersById = new Map(market.offers.map((o) => [o.id, o]));
  const ordersById = new Map(market.orders.map((o) => [o.id, o]));
  // The run's sales pay the wages and site bills it deferred, pro rata, before
  // close; what they cannot cover stays owed as an ordinary payable.
  const settledCash = new Map(market.accounts.map((a) => [a.id, a.cash]));
  const unpaidBills = (p: ProductionPlan) => {
    const paid = payments.get(p.id)!;
    return (
      Math.max(0, p.labourCost - paid.labour) + Math.max(0, p.otherOperatingCost - paid.operating)
    );
  };
  for (const id of salesAdvance.keys()) {
    // Read after the input true-up, which already forgave the unmade share.
    const deferred = plans.reduce((sum, p) => (p.accountId === id ? sum + unpaidBills(p) : sum), 0);
    const fraction = deferredBillFraction(settledCash.get(id) ?? 0, deferred);
    if (!(fraction > 0)) continue;
    for (const p of plans) {
      if (p.accountId !== id) continue;
      const paid = payments.get(p.id)!;
      const labour = Math.max(0, p.labourCost - paid.labour) * fraction;
      const operating = Math.max(0, p.otherOperatingCost - paid.operating) * fraction;
      if (!(labour + operating > 0)) continue;
      settledCash.set(id, settledCash.get(id)! - labour - operating);
      settledCash.set(
        p.labourRecipientAccountId,
        settledCash.get(p.labourRecipientAccountId)! + labour
      );
      settledCash.set(
        p.operatingRecipientAccountId,
        settledCash.get(p.operatingRecipientAccountId)! + operating
      );
      payments.set(p.id, {
        labour: paid.labour + labour,
        operating: paid.operating + operating,
        arrears: Math.max(0, paid.arrears - labour - operating),
      });
    }
    // Float noise from the pro rata split must not leave a sliver below zero.
    if (settledCash.get(id)! < 0) settledCash.set(id, 0);
  }
  for (const value of settledCash.values())
    if (!(value >= 0)) throw new Error("Producer closed below zero after its sales advance");
  // Free cash after the deferred bills are settled; minor-input premiums are
  // paid from it below, and closing balances are read from it at the end.
  const freeCash = settledCash;
  for (const p of plans) {
    const stocks = new Map<string, PurchasedStock>();
    for (const stock of p.inputStock) {
      const previous = stocks.get(stock.commodity) ?? {
        commodity: stock.commodity,
        units: 0,
        value: 0,
      };
      previous.units += stock.units;
      previous.value += stock.value;
      stocks.set(stock.commodity, previous);
    }
    let purchases = 0;
    for (const recipe of p.inputs) {
      const bought = orderIdsForInput(p.id, recipe.commodity).reduce(
        (total, id) => {
          const order = ordersById.get(id)!;
          return {
            deliveredUnits: total.deliveredUnits + order.deliveredUnits,
            cost: total.cost + order.cost,
          };
        },
        { deliveredUnits: 0, cost: 0 }
      );
      const stock = stocks.get(recipe.commodity) ?? {
        commodity: recipe.commodity,
        units: 0,
        value: 0,
      };
      stock.units += bought.deliveredUnits;
      stock.value += bought.cost;
      purchases += bought.cost;
      stocks.set(recipe.commodity, stock);
    }
    // Make do: the plant produces its settled plan and uses up to what it has
    // of each input; a short input is used up rather than limiting output.
    const produced = plannedById.get(p.id)!;
    let consumed = 0;
    // A minor input the plant ran without is improvised at a premium, paid to
    // the site's operating payee (makeDoRules.ts). Unpaid premium is owed.
    let minorInputPremium = 0;
    const minor = minorByPlan.get(p.id)!;
    for (const [k, recipe] of p.inputs.entries()) {
      const stock = stocks.get(recipe.commodity)!;
      if (minor[k] && p.operatingRecipientAccountId !== p.accountId)
        minorInputPremium += minorInputShortfallCost({
          produced,
          unitsPerOutput: recipe.unitsPerOutput,
          available: stock.units,
          maximumUnitPrice: recipe.maximumUnitPrice,
        });
      const used = Math.min(stock.units, produced * recipe.unitsPerOutput);
      const exhausted = used >= stock.units * (1 - 1e-12);
      const cost = exhausted
        ? stock.value
        : stock.units > 0
          ? (stock.value * used) / stock.units
          : 0;
      stock.units = exhausted ? 0 : Math.max(0, stock.units - used);
      stock.value = exhausted ? 0 : Math.max(0, stock.value - cost);
      consumed += cost;
    }
    const premiumPaid = Math.min(minorInputPremium, Math.max(0, freeCash.get(p.accountId) ?? 0));
    if (premiumPaid > 0) {
      freeCash.set(p.accountId, freeCash.get(p.accountId)! - premiumPaid);
      freeCash.set(
        p.operatingRecipientAccountId,
        (freeCash.get(p.operatingRecipientAccountId) ?? 0) + premiumPaid
      );
    }
    accrueProducerPayable(closingPayables, {
      debtorAccountId: p.accountId,
      creditorAccountId: p.operatingRecipientAccountId,
      producerId: p.id,
      kind: "operating",
      amount: Math.max(0, minorInputPremium - premiumPaid),
    });
    let inventoryWriteOff = 0;
    for (const stock of stocks.values()) {
      const loss = carryLoss(stock.commodity);
      inventoryWriteOff += stock.value * loss;
      stock.units *= 1 - loss;
      stock.value *= 1 - loss;
    }
    let revenue = 0,
      offeredUnits = 0,
      soldUnits = 0,
      deliveredUnits = 0,
      // Value-weighted share of this turn's output that went to stock unsold.
      unsoldShare = 0;
    const products: ProducerOperatingResult["products"] = [];
    const outputStock = p.outputs.map((output) => {
      const sold = offersById.get(JSON.stringify([p.id, "output", output.commodity]))!;
      revenue += sold.revenue;
      offeredUnits += sold.offeredUnits;
      soldUnits += sold.soldUnits;
      deliveredUnits += sold.deliveredUnits;
      const opening = p.outputStock
        .filter((s) => s.commodity === output.commodity && s.book === output.book)
        .reduce((n, s) => n + s.units, 0);
      const available = opening + produced * output.unitsPerOutput;
      const openingRows = p.outputStock.filter(
        (stock) =>
          stock.commodity === output.commodity && stock.book === output.book && stock.units > 0
      );
      const outputValue = p.outputs.reduce(
        (sum, row) => sum + row.unitsPerOutput * row.referenceUnitPrice,
        0
      );
      const weight =
        outputValue > 0 ? (output.unitsPerOutput * output.referenceUnitPrice) / outputValue : 0;
      const made = produced * output.unitsPerOutput;
      if (made > 0) unsoldShare += (weight * Math.max(0, made - sold.deliveredUnits)) / made;
      // Preserve an unknown historical cost as unknown. A reference price or
      // this turn's fixed bill cannot manufacture the old stock's cost basis.
      const knownOpeningCost = openingRows.every((stock) => stock.quoteUnitCost != null);
      const quoteUnitCost =
        available > 0 && knownOpeningCost && (made === 0 || outputValue > 0)
          ? cappedStockUnitCost(
              finite(
                (openingRows.reduce((sum, stock) => sum + stock.units * stock.quoteUnitCost!, 0) +
                  (made > 0
                    ? (consumed + minorInputPremium + p.labourCost + p.otherOperatingCost) * weight
                    : 0)) /
                  available,
                "closing stock quote cost"
              ),
              output.referenceUnitPrice
            )
          : undefined;
      if (sold.deliveredUnits - available > Math.max(1e-8, available * 1e-12))
        throw new Error("Sold output exceeded input-backed production");
      const unsold = Math.max(0, available - sold.deliveredUnits);
      const carried =
        output.storable && sold.deliveredUnits < available * (1 - 1e-12)
          ? unsold * (1 - carryLoss(output.commodity))
          : 0;
      // Stock beyond the cover is written down a little each turn (stockCoverRules).
      const recentSoldOut = recentSoldOf(p, output.commodity, output.book);
      const writtenDown =
        recentSoldOut != null
          ? Math.min(
              carried,
              writeDownUnits(carried, stockCover(opening, recentSoldOut), {
                coverTurns: input.stockCoverTurns ?? 0,
              })
            )
          : 0;
      const kept = carried - writtenDown;
      // The written-down units leave stock without a second charge: their
      // production cost was expensed in `consumed`, labour and site bills on the
      // turn they were made, and finished stock is not capitalized.
      products.push({
        commodity: output.commodity,
        book: output.book,
        producedUnits: produced * output.unitsPerOutput,
        offeredUnits: sold.offeredUnits,
        soldUnits: sold.soldUnits,
        internalDeliveredUnits: sold.internalDeliveredUnits,
        deliveredUnits: sold.deliveredUnits,
        revenue: sold.revenue,
        askingUnitPrice: postedOffers.get(JSON.stringify([p.id, "output", output.commodity]))!
          .unitPrice,
        realizedUnitPrice: sold.soldUnits > 0 ? sold.revenue / sold.soldUnits : null,
        unsoldUnits: unsold,
        lostUnits: unsold - kept,
      });
      return {
        commodity: output.commodity,
        book: output.book,
        units: kept,
        ...(quoteUnitCost != null && kept > 0 ? { quoteUnitCost } : {}),
      };
    });
    const paid = payments.get(p.id)!;
    const payableKey = JSON.stringify([p.accountId, p.id]);
    const arrearsPaid = oldBillsPaidByProducer.get(payableKey) ?? 0;
    accrueProducerPayable(closingPayables, {
      debtorAccountId: p.accountId,
      creditorAccountId: p.labourRecipientAccountId,
      producerId: p.id,
      kind: "labour",
      amount: Math.max(0, p.labourCost - paid.labour),
    });
    accrueProducerPayable(closingPayables, {
      debtorAccountId: p.accountId,
      creditorAccountId: p.operatingRecipientAccountId,
      producerId: p.id,
      kind: "operating",
      amount: Math.max(0, p.otherOperatingCost - paid.operating),
    });
    const closingArrears = (oldBillsRemainingByProducer.get(payableKey) ?? 0) + paid.arrears;

    finite(
      consumed + minorInputPremium + inventoryWriteOff + p.labourCost + p.otherOperatingCost,
      "production expense"
    );
    results.push({
      id: p.id,
      capacityUnits: p.capacityUnits,
      activeUnits: p.capacityUnits * p.activeFraction,
      plannedUnits: proposedById.get(p.id)!,
      ...(p.plannedRunShare != null ? { plannedRunShare: p.plannedRunShare } : {}),
      ...(billedRunShare.has(p.id) ? { billedRunShare: billedRunShare.get(p.id)! } : {}),
      ...(() => {
        const reasons: RunCutReason[] = [];
        if (
          (runShare.get(p.accountId) ?? 1) < 1 - 1e-12 ||
          (!inputReserve.has(p.accountId) &&
            !salesAdvance.has(p.accountId) &&
            (funding.get(p.accountId) ?? 1) < 1 - 1e-12)
        )
          reasons.push("cash");
        if (billedRunShare.has(p.id)) reasons.push("inputs");
        return reasons.length > 0 ? { runCutBy: reasons } : {};
      })(),
      ...(p.idleOperatingCost != null
        ? { idleOperatingCost: Math.min(p.otherOperatingCost, Math.max(0, p.idleOperatingCost)) }
        : {}),
      producedUnits: produced,
      offeredUnits,
      soldUnits,
      deliveredUnits,
      revenue,
      purchases,
      inputsConsumed: consumed,
      ...(minorInputPremium > 0 ? { minorInputPremium } : {}),
      inventoryWriteOff,
      labourPaid: paid.labour,
      otherOperatingPaid: paid.operating,
      labourArrears: p.labourCost - paid.labour,
      otherOperatingArrears: p.otherOperatingCost - paid.operating,
      operatingArrears: paid.arrears,
      arrearsPaid,
      closingArrears,
      profit:
        revenue -
        consumed -
        minorInputPremium -
        inventoryWriteOff -
        p.labourCost -
        p.otherOperatingCost,
      unsoldProductionCost: consumed * Math.min(1, Math.max(0, unsoldShare)),
      cashFlow: revenue - purchases - paid.labour - paid.operating - premiumPaid - arrearsPaid,
      inputStock: [...stocks.values()],
      // A sold-out retained good (no longer in the recipe) leaves no row: next
      // turn's plan has no output for it, so an empty row would be unrecognized.
      outputStock: outputStock.filter(
        (stock, i) => stock.units > 0 || p.outputs[i].unitsPerOutput > 0
      ),
      products,
    });
  }
  if (creditAccounts.size > 0) {
    const owedAt = (claims: Iterable<ProducerPayable>) => {
      const owed = new Map<string, number>();
      for (const c of claims)
        owed.set(c.debtorAccountId, (owed.get(c.debtorAccountId) ?? 0) + c.amount);
      return owed;
    };
    const opening = owedAt(input.payables ?? []);
    const closing = owedAt(closingPayables.values());
    const priorSince = new Map<string, number>();
    for (const c of input.payables ?? [])
      if (c.notShrinkingSince != null)
        priorSince.set(
          c.debtorAccountId,
          Math.min(priorSince.get(c.debtorAccountId) ?? c.notShrinkingSince, c.notShrinkingSince)
        );
    for (const [id, claim] of closingPayables)
      if (creditAccounts.has(claim.debtorAccountId))
        closingPayables.set(id, {
          ...claim,
          notShrinkingSince: payablesNotShrinkingSince({
            turn: input.turn,
            openingOwed: opening.get(claim.debtorAccountId) ?? 0,
            closingOwed: closing.get(claim.debtorAccountId) ?? 0,
            priorSince: priorSince.get(claim.debtorAccountId),
          }),
        });
  }
  const closingAccounts = market.accounts.map((account) => ({
    ...account,
    cash: (freeCash.get(account.id) ?? account.cash) + (heldForPayables.get(account.id) ?? 0),
  }));
  const closingCash = new Map(closingAccounts.map((a) => [a.id, a.cash]));
  const openingTotal = [...originalCash.values()].reduce((n, v) => n + v, 0);
  const closingTotal = [...closingCash.values()].reduce((n, v) => n + v, 0);
  if (
    !Number.isFinite(closingTotal) ||
    Math.abs(openingTotal - closingTotal) > Math.max(1e-7, Math.abs(openingTotal) * 1e-12)
  )
    throw new Error("Producer market cash did not reconcile");
  return {
    accounts: closingAccounts,
    payables: [...closingPayables.values()].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    ),
    payablePayments: prior.payments,
    producers: results,
    tradeReceipt: market.tradeReceipt,
    prices: market.prices,
    ...(spillover ? { spillover } : {}),
    ...(market.countryBooks ? { countryBooks: market.countryBooks } : {}),
    orderOutcomes: (() => {
      const meta = new Map(
        [...consumerOrders, ...inputOrders()].map((o) => [
          o.id,
          { commodity: o.commodity, book: o.book, accountId: o.accountId },
        ])
      );
      return market.orders.flatMap((o) => {
        const m = meta.get(o.id);
        return m
          ? [{ ...m, requestedUnits: o.requestedUnits, deliveredUnits: o.deliveredUnits }]
          : [];
      });
    })(),
  };
}
