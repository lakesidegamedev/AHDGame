/** Plain-data requests, receipts and injected execution controls for producer planning. */
import type {
  MarketAccount,
  ProducerOffer,
  ProducerTradeReceipt,
  PurchaseOrder,
  settleProducerMarket,
} from "./rules";
import type { ProducerPayable } from "./payablesRules";
import type { ProducerCreditPolicy } from "./producerCreditRules";
import type { householdPurchaseOrders } from "./householdRules";
import type {
  ProductionPlan,
  ProducerOperatingResult,
  ProducerInputReservation,
} from "./production";
import type { ProducerPlanningDiagnostics } from "./planningRules";

export type ProducerEconomyInput = {
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
  /** Own sites take the company's own output before outside buyers, nearest first (settleProducerMarket). */
  ownSitesFirst?: boolean;
  /** Companies that explicitly chose market first: their own orders clear after outside buyers (rules.ts). */
  marketFirstAccounts?: readonly string[];
  /** Explicit carry policy for alternate catalogs; ordinary worlds use commodity spoilage. */
  carryLossByCommodity?: Readonly<Record<string, number>>;
  /** Turns of recent sales a seller may carry before marking down (stockCoverRules); 0 or absent = off. */
  stockCoverTurns?: number;
  /** Last turn's clearing price per lane (`laneKeyOf`), the anchor for automatic asks. */
  clearingPriceByLane?: Readonly<Record<string, number>>;
  /** Country of a producing site, so offers and its input orders carry one. */
  countryOfProducer?: (producerId: string) => string | undefined;
  /** Build the per-country funded book on the final settlement (see fundedBookRules). */
  trackCountryBooks?: boolean;
  /** Private companies that may owe wages and site bills to keep running (producerCreditRules). */
  credit?: ProducerCreditPolicy;
  /**
   * Judge whether a run's sales pay for it with its inputs at last turn's
   * clearing price (`clearingPriceByLane`), never above the bid ceiling,
   * instead of at the ceiling (gameConfig.producerSalesAdvancePriceStage).
   */
  salesAdvanceAtClearing?: boolean;
  /** Share of expected sales a run may borrow against; absent keeps the 0.9 default. */
  salesAdvanceRevenueShare?: number;
  /**
   * Let an idle plant whose company cannot fund a run and that sold nothing
   * last turn run a small probe on intra-turn credit against its output's
   * market price (restartProbeRules, gameConfig.producerZombieRestartStage).
   */
  restartProbes?: boolean;
  /**
   * Households spend from income (householdSpendRules, producerHouseholdIncomeSpendStage):
   * each wallet's basket budget is its spend share of this turn's wages plus a
   * draw share of the rest of its cash, instead of the spend share of all its
   * cash. Absent = off.
   */
  householdIncomeSpend?: { savingsDrawShare: number };
  /**
   * Record, per product, the value of own-site deliveries for a company whose
   * own sites were left short of that good: the lower of their highest bid and
   * the output's reference, never under the ask (producerCaptiveDeliveryStage >= 2).
   */
  captiveShortValue?: boolean;
  /**
   * Book own-site deliveries at this turn's lane clearing price, or the seller's
   * ask when the lane did not trade: matching internal supply income for the
   * seller and charge for the receiving site, no cash moved
   * (captiveMarketValueRules, producerCaptiveDeliveryStage >= 3).
   */
  captiveMarketValue?: boolean;
  /**
   * Credit each seller's own-site deliveries at the same prices to the sector
   * valuation only (valuationCredit / valuationCharge on the result); no site
   * account or cash changes (gameConfig.fundedValuationOwnSiteCreditStage).
   */
  ownSiteValuationCredit?: boolean;
  /**
   * Shortage ask step (shortageAskRules, gameConfig.producerShortageAskStage):
   * an automatic seller that sold out into a lane where buyers went short asks
   * a step above last turn's clearing instead of at it. Absent = off.
   */
  shortageAsk?: {
    /** Requested / delivered per lane last turn (bookPressure). */
    pressureByLane: Readonly<Record<string, number>>;
    maxStep?: number;
    maxMultiplier?: number;
  };
  /** Automatic ask tie-break (quoteProducer buyerTieBreak), producerAskBuyerTieStage >= 1. */
  askBuyerTieBreak?: boolean;
  /** Automatic asks assume dearer competitors match (quoteProducer competitorsMatch), stage >= 2. */
  askCompetitorsMatch?: boolean;
};

export type ProducerPlanningExecution = {
  /** Independent whole-operation deadline supplied by the host. */
  checkBudget?: () => void;
  /** The host owns the clock. Checked between whole clearing passes only. */
  elapsedMs: () => number;
  maximumElapsedMs: number;
};

export type ProducerEconomyResult = {
  accounts: MarketAccount[];
  payables: ProducerPayable[];
  payablePayments: ProducerPayable[];
  producers: ProducerOperatingResult[];
  /** Optional for receipts written before convergence diagnostics existed. */
  planning?: ProducerPlanningDiagnostics;
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
    /**
     * Measurement only: the part of `requestedUnits` placed as household
     * spillover after a first choice sold out. Absent when none.
     */
    spilloverRequestedUnits?: number;
  }>;
  /** Household spend stranded in sold-out lanes and how much the extra clearing placed. */
  spillover?: { strandedSpend: number; extraRequested: number; recovered: number };
  /** Per-country funded book from the settled clearing, when `trackCountryBooks` is on. */
  countryBooks?: ReturnType<typeof settleProducerMarket>["countryBooks"];
};
