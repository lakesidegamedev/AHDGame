import type {
  GroupManagement,
  GroupReceivingPreference,
  GroupDirection,
} from "@/lib/corporations/groups/managementTypes";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import type { ShareHoldingTerms } from "@/lib/corporations/rules/holdingTerms";
import type { ObjectId } from "mongodb";
import type {
  ManufacturingDevelopmentCashReceiptV2,
  ManufacturingProductAdvertisingObligationV2,
  ManufacturingProductAdvertisingReceiptV2,
} from "@/lib/products/manufacturingProject";
import type {
  MediaProductAdvertisingReceipt,
  MediaProductDevelopmentReceipt,
} from "@/lib/products/mediaProduct";
import type {
  CorporationType,
  ManufacturingIndustryModel,
  MediaDiscriminator,
} from "../../constants/corporations";
import type { CountryId } from "../../constants/countries";
import type { CurrencyCode } from "../../constants/currencies";
import type { ProductAdvertisingDenominationWitness } from "@/lib/products/rules/productAdvertising";

export interface Shareholder {
  /** Character holder, present for character-owned positions */
  characterId?: ObjectId;
  /** Imperial character holder, present for imperial-owned positions */
  imperialCharacterId?: ObjectId;
  /** Corporation holder, present for corp-owned positions */
  corporationId?: ObjectId;
  /** Index fund holder, present for passive fund-owned positions */
  fundId?: ObjectId;
  /** Managed funds do not earn passive index price or credit benefits. */
  passiveIndexEligible?: boolean;
  /** NPP holder, present for NPP CEO-owned positions */
  nppId?: ObjectId;
  shares: number;
  /** Weighted average purchase price per share. Null for pre-tracking positions. */
  avgCostPerShare?: number;
  /** Legacy averages were in issuer currency; tracked averages are anchor-denominated. */
  avgCostBasisUnit?: "anchor";
  /** Direct personal shares only. Purchase turns are discarded after maturity. */
  holdingTerms?: ShareHoldingTerms;
  /**
   * Founder supershare count (dual-class structure). Stamped at adoption with
   * the founder's then-current share count; never increased afterwards. The
   * votable amount is `min(superShares, shares)`, see lib/corporations/superShares.
   */
  superShares?: number;
}

export interface MediaProductAdvertisingObligationV1 {
  projectId: string;
  turn: number;
  amountAnchor: number;
  buyerAmountLocal: number;
  buyerCurrencyCode: CurrencyCode;
  buyerLocalPerAnchor: number;
  /** Absent on obligations persisted before raw-denomination guards were added. */
  buyerDenomination?: ProductAdvertisingDenominationWitness;
  sellerAllocations: Array<{
    corporationId: string;
    amountLocal: number;
    currencyCode: CurrencyCode;
    localPerAnchor: number;
    /** Absent on obligations persisted before raw-denomination guards were added. */
    denomination?: ProductAdvertisingDenominationWitness;
  }>;
}

export interface ShareOrder {
  _id: ObjectId;
  /** The corporation whose shares are being traded */
  corporationId: ObjectId;
  /**
   * The character who authorized this order (CEO when a corp is placing it).
   * Optional: absent for index-fund-owned orders, which set `placerFundId`
   * instead and have no authorizing character.
   */
  characterId?: ObjectId;
  /** Set when this order is placed by a corporation on its own behalf */
  placerCorporationId?: ObjectId;
  /**
   * Set when this order is owned by an index fund (no authorizing character).
   * Funds only ever place buy orders here. On fill the matcher credits the
   * fund's cap-table holdings (`fundId`) and refunds unused escrow to the
   * fund's `cashAnchor`.
   */
  placerFundId?: ObjectId;
  /** Standing quote created by the bounded equity-liquidity facility. */
  liquidityProvider?: boolean;
  /** Turn and reference price used to construct the standing quote. */
  liquidityQuotedTurn?: number;
  liquidityReferencePrice?: number;
  /** Claim token of the batched cancel that closed this order (index-fund requote). */
  cancelClaimId?: ObjectId;
  type: "buy" | "sell";
  shares: number;
  sharesRemaining: number;
  /**
   * True when the order reserved inventory by debiting the holder at creation
   * time. Legacy rows may omit this and still rely on reservation-only math.
   */
  sharesDebitedAtCreation?: boolean;
  /** Inventory held in escrow; retain original purchase turns and anchor basis. */
  holdingTerms?: ShareHoldingTerms;
  pricePerShare: number;
  escrowAmount: number;
  /**
   * Anchor (₳) value escrowed from the fund's `cashAnchor` at placement.
   * Fund orders only. Decremented proportionally as the order fills; the
   * remaining balance is refunded to `cashAnchor` on cancel.
   */
  escrowAnchor?: number;
  status: "open" | "filled" | "cancelled";
  /**
   * Idempotency key of the latest fill attempt, stamped atomically by the
   * order-claim write. Lets the next fill resume a crashed attempt's audit rows.
   */
  lastShareFillKey?: string;
  /** Serializes an order's money settlement, cancellation, and holding-lot claim. */
  activeShareFillKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Public-service operating posture for a state-owned corporation (spec §11.4).
 * Corp-level is the National Corporation's default; a CorporateSector may
 * override per-sector. Absence ⇒ no posture (normal SOE operation).
 */
export interface SoeMandate {
  /** Trade margin for public value: lower margin, stronger metric contribution. */
  priceControlled?: boolean;
  /** Worker floor (already enforced by shed-exclusion); adds unemployment relief. */
  employmentGuaranteed?: boolean;
}

export interface CeoTenure {
  /** characterId, imperialCharacterId, or nppId of the CEO during this tenure */
  holderId: ObjectId;
  ceoType: "character" | "imperial" | "npp";
  startTurn: number;
  /** Absent while the holder is currently sitting; set when the tenure ends. */
  endTurn?: number;
}

/**
 * Command Economy v2 (P0), per-SOE planned-economy overlay carried on a
 * state-owned enterprise corporation. One SOE is seeded per commanding-height
 * sector for a command country (RU, and CN in its command years). Reuses the
 * existing corp/sector plumbing; these are the extra fields the design names so
 * plan-fulfillment, soft budgets and (P1) directed credit have somewhere to live.
 */
export interface SoeState {
  /** The commanding-height sector this enterprise operates. */
  sector: OperatingSectorType;
  /** Planned productive capacity in output units/turn (the ceiling on output). */
  capacity: number;
  /** Realized output this turn, in the same units as `planTarget`. */
  output: number;
  /** The plan quota the SOE is scored against (output / target = fulfillment). */
  planTarget: number;
  /** Efficiency index (1.0 = baseline); trends with output-vs-capacity. */
  efficiency: number;
  /** Cumulative soft-budget losses the state has absorbed (never dissolves). */
  cumulativeLosses: number;
  /** Appointed director (player or NPP); null when the seat is vacant. */
  directorId: ObjectId | null;
  /** Display name of the appointed director (denormalized for readouts). */
  directorName?: string | null;
  /**
   * Command Economy v2 (P2): the SOE director's operating levers. Persisted by
   * the director role panel and honored (bounded) by the command-economy turn
   * phase; absent → the NPP brain runs the enterprise on defaults.
   */
  directive?: {
    /**
     * Labour-vs-quality tradeoff, 0 (chase raw output quantity, efficiency
     * suffers) → 1 (chase efficiency/quality, output growth is slower). 0.5 =
     * balanced. Nudges the efficiency trend in the turn phase.
     */
    laborQuality?: number;
    /**
     * The director's requested investment for the coming turns, in plan-output
     * units. A demand signal surfaced to Gosbank; it also draws extra directed
     * credit toward this SOE under the automatic allocation. 0 = no request.
     */
    investmentRequest?: number;
    /** Last turn the director set these levers (audit). */
    setOnTurn?: number;
  };
}

import type { NppStrategyState } from "@/lib/turn/npp/corpStrategy";

/** A move autopilot recommends but leaves to the owner. */
export type CorpAutopilotAdvisoryKind = "pivot" | "debt" | "distress" | "losers" | "tech";

export interface CorpAutopilotAdvisory {
  kind: CorpAutopilotAdvisoryKind;
  /** First turn of the current unbroken run of this advisory. */
  sinceTurn: number;
  /** Short subject, e.g. the technology name for `tech`. */
  subject?: string;
}

interface CorporationAutopilot {
  enabledTurn: number;
  advisories?: CorpAutopilotAdvisory[];
  /** Last turn the owner was notified about each advisory kind (throttle). */
  notifiedTurn?: Partial<Record<CorpAutopilotAdvisoryKind, number>>;
}

/** Moves an NPP operator can make for a corporation. */
export type CorpOperatorAction =
  "found" | "grow" | "divest" | "retool" | "borrow" | "budgets" | "dividends" | "research";

/** `ask` records an advisory for the owner instead of acting, where one exists. */
export type CorpOperatorPermission = "allow" | "ask" | "never";

/**
 * Owner-set limits on what an NPP operator (autopilot, caretaker or an NPP CEO
 * of a subsidiary) may do. Absent keeps each role's default behavior exactly.
 */
export interface CorporationOperatorPolicy {
  /** Per-action overrides; an action left out keeps its role default. */
  actions?: Partial<Record<CorpOperatorAction, CorpOperatorPermission>>;
  /** Operating sector types the operator may found or grow in; absent means any. */
  sectorTypes?: string[];
  /** Countries the operator may found or grow in; absent means any. */
  countryIds?: string[];
  /**
   * Standing answer to an NPP CEO's pay demand when nobody responds in time:
   * accept a raise costing up to this share of trailing profit, else replace
   * the CEO. Absent means the default (3%).
   */
  ceoPayAutoAcceptShare?: number;
  setTurn: number;
}

/** NPP CEO career and pay state for a corporation run by an NPP CEO. */
export interface CorporationCeoPay {
  /** The NPP this state belongs to; a different ceoId restarts the schedule. */
  ceoId: string;
  appointedTurn: number;
  nextReviewTurn: number;
  /** CEO level at the last review (1 to 10); drives the overhead discount. */
  level?: number;
  /** Open pay demand awaiting the owner, in the company's currency per day. */
  demand?: {
    amount: number;
    turn: number;
    expiresTurn: number;
    level: number;
    trailingProfit: number;
  };
  /** Last resolved review, for the company page. */
  lastDecision?: {
    turn: number;
    outcome: "accepted" | "countered" | "replaced";
    salary?: number;
    bySystem: boolean;
  };
}

export interface Corporation {
  /** Unified producer market: creditor claims, written only once the new market settles. */
  producerPayables?: import("./producerEconomy").ProducerPayablesState;
  /** Frozen migration fallback for unrecorded legacy personal cost basis. */
  stockHoldingRolloutAnchorPrice?: number;
  stockHoldingRolloutTurn?: number;
  /** Group settings are runtime state and disappear with corporations on world reset. */
  groupManagement?: Partial<GroupManagement>;
  groupReceiving?: GroupReceivingPreference;
  groupDirection?: GroupDirection;
  /** Bounded private forecast inputs, written only while coordination is enabled. */
  groupSupplyBasis?: import("@/lib/corporations/groups/rules/forecast").GroupForecastBasis;

  _id: ObjectId;
  name: string;
  /**
   * Stock ticker symbol (1, 5 uppercase letters). Globally unique among
   * corporations that have one. Required on corps founded after this
   * feature shipped; legacy corps may not have it.
   */
  tickerSymbol?: string;
  description?: string;
  type: CorporationType;
  /** Specialized model identity when the primary type is manufacturing. */
  industryModel?: ManufacturingIndustryModel | null;
  /** Preserves entertainment's legacy operating identity inside media. */
  mediaDiscriminator?: MediaDiscriminator | null;
  /** Optional secondary sector focus, halves sector match bonus, doubles base sprawl threshold */
  /** Secondary specialization: an operating lane (a type, or the vehicles/entertainment lane). */
  secondaryType?: OperatingSectorType | null;
  /** Turn when primary/secondary type was last switched (for penalty duration) */
  typeSwitchTurn?: number | null;
  /** Turn after which another type switch is allowed (cooldown) */
  typeSwitchCooldownUntilTurn?: number | null;
  /**
   * Private banking (1.1): the corp's chartered bank, if any. Requires owning
   * at least one financial sector; one bank per corp. See src/lib/db/types/bank.ts.
   */
  bankCharter?: import("./bank").BankCharter;
  /** Actual primary cash debit holds its epoch until debt and holdings publish. */
  bankPrimaryFunding?: { tradeId: string; charteredTurn: number };
  /** Holds an originating epoch until construction cash and its loan book settle. */
  bankConstructionFunding?: {
    loanId: string;
    charteredTurn: number;
    kind: "funding" | "aborting" | "returning" | "servicing" | "recovery";
    /** Written with the actual vault debit, never from a quote or cached book. */
    disbursed: boolean;
    service?: {
      key: string;
      turn: number;
      sectorId?: string;
      /** A bank-level construction servicing batch: every loan its key owns. */
      loanIds?: string[];
    };
    depositReturn?: {
      cause: "failure" | "revocation" | "admin_unwind" | "charter_switch";
      turn: number;
      releaseResidualToOwner: boolean;
    };
  };
  /** Issuer-selected primary-market underwriter for future issues. */
  primaryUnderwritingMandate?: import("@/lib/banking/underwritingTypes").PrimaryUnderwritingMandate;
  primaryUnderwritingMandateRevision?: number;
  /** Incoming funded proceeds pin the issuer's native cash denomination until ACK. */
  primaryUnderwritingIncomingFunding?: {
    key: string;
    currencySnapshot: import("@/lib/banking/underwritingTypes").PrimaryUnderwritingCurrencySnapshot;
    turn: number;
  };
  /** Frozen unpaid founding IPO plan. The corporation remains private until its journal publishes it. */
  foundingIpoUnderwritingPending?: {
    offer: import("@/lib/banking/underwritingTypes").PrimaryUnderwritingOffer & {
      instrumentId: ObjectId;
    };
    grossPlacedLocal: number;
    turn: number;
    instrumentProjection: import("@/lib/banking/rules/boundary").TransitionProjection;
  } | null;
  /** Original-epoch lease held only while a funded underwriting claim is settling. */
  bankUnderwritingFunding?: {
    key: string;
    issuerCorporationId: ObjectId;
    instrumentType: "equity" | "corporate_bond";
    instrumentId?: ObjectId;
    charteredTurn: number;
    offer: import("@/lib/banking/underwritingTypes").PrimaryUnderwritingOffer;
    currencyCode: CurrencyCode;
    grossLocal: number;
    feeLocal: number;
    issuerNetLocal: number;
    turn: number;
    issuerName: string;
    poolCollection: "equityMarketPools" | "bondMarketPools";
    instrumentProjection: import("@/lib/banking/rules/boundary").TransitionProjection;
  };
  /** Frozen relocation-bond quote held until the matching bond and HQ update ACK. */
  headquartersRelocationBondFunding?: {
    operationKey: string;
    targetStateId: string;
    targetCountryId: CountryId;
    turn: number;
    relocationCostAnchor: number;
    crossCountry: boolean;
    relocationSpreadAnchor: number;
    currencyCode: CurrencyCode;
    nativeFxRate: number;
    sourceCountryIdPresent: boolean;
    sourceCountryId?: CountryId;
    sourceLiquidCurrencyCodePresent: boolean;
    sourceLiquidCurrencyCode?: CurrencyCode;
    bondId: ObjectId;
    preflight: import("@/lib/corporations/issueRelocationBond").RelocationBondPreflight;
    ceoVacated: boolean;
    ceoId?: ObjectId;
    ceoType?: Corporation["ceoType"];
  };
  /** Cumulative fees from actually funded primary placements, by native currency. */
  bankUnderwritingIncomeByCurrency?: Partial<Record<CurrencyCode, number>>;
  /** Bounded issuer-readable receipts for funded primary underwriting fees. */
  bankUnderwritingReceipts?: Array<{
    key: string;
    issuerCorporationId: ObjectId;
    issuerName: string;
    instrumentType: "equity" | "corporate_bond";
    instrumentId?: ObjectId;
    currencyCode: CurrencyCode;
    grossPlacedLocal: number;
    feeLocal: number;
    issuerNetLocal: number;
    turn: number;
    charteredTurn: number;
  }>;
  /** Public media editorial position. Missing means neutral for legacy worlds. */
  editorialStance?: { economic: number; social: number };
  /** Funded sale proceeds held here until delivered to the matching charter or insurer. */
  bankTreasuryEscrows?: Record<
    string,
    {
      bankId: string;
      charteredTurn: number;
      currencyCode: CurrencyCode;
      amountLocal: number;
      tradeId: string;
    }
  >;
  /** Funded sovereign claims held outside the replaceable charter subdocument. */
  bankSovereignEscrows?: Record<
    string,
    {
      bankId: string;
      charteredTurn: number;
      currencyCode: CurrencyCode;
      amountLocal: number;
      claimKind: "coupon" | "maturity";
    }
  >;
  /** Monotonic generation for atomic proprietary book settlement. */
  bankPropBookRevision?: number;
  /** Bank-level rolling forex volume survives charter replacement. */
  bankPropForexVolume?: import("@/lib/banking/rules/propForexFees").PropForexVolume[];
  /** Fees reserved with a prop trade, delivered from the original cash quote. */
  bankPropForexFee?: import("@/lib/banking/rules/propForexFees").PropForexFeeReceipt & {
    amountLocal: number;
  };
  /**
   * Crash-recovery plan for an in-flight bank-charter transfer. Stamped on the
   * absorbed shell before its charter slot is claimed, cleared once every
   * satellite record is re-keyed. A marker surviving a crash tells the next
   * attempt where the charter went and which currency the depositor pointers
   * use, so the retry resumes instead of reporting "no transfer required" over
   * split records. Dies with the shell when the merge completes.
   */
  bankCharterTransfer?: {
    /** Corporation the charter is moving (or moved) to. */
    to: ObjectId;
    /** Charter currency, for the legacy savingsHolder pointer path. */
    currency: CurrencyCode;
    /**
     * Unique token per stamping attempt, claimed atomically and required by all
     * resume, release, cleanup, re-key, and plan-clear decisions so concurrent
     * transfers of one shell cannot mistake each other's writes for their own.
     * Absent on plans stamped before tokens existed: never resumed once the
     * charter has left the shell.
     */
    attemptId?: string;
    /**
     * Charter copies possibly orphaned by superseded attempts that still need
     * removal. Each supersession appends the replaced plan's owner plus the
     * fingerprint it may have claimed; every owner and same-pair joiner drains the
     * list with fingerprint-guarded removals before claiming, so a crash between
     * the plan compare-and-swap and cleanup cannot strand a ghost bank. The list is
     * append-only (deduplicated) across supersessions and dies with the plan on
     * clear.
     */
    orphans?: {
      /** Corporation that may hold the orphaned copy. */
      to: ObjectId;
      /** Fingerprint of the charter copy to remove. */
      fingerprint: string;
    }[];
    /**
     * Ownership fingerprint of the charter being moved
     * (`charterFingerprint` in transferCharter.ts): identity plus economic
     * fields, so a genuinely different bank sharing currency/turn/type/status
     * never reads as this attempt's claimed copy.
     */
    fingerprint?: string;
    /** When the plan was stamped. */
    startedAt: Date;
  };
  /** Character who owns/runs this corporation */
  ceoId: ObjectId;
  /** Whether the CEO is a regular character, imperial character, or NPP. Defaults to "character". */
  ceoType?: "character" | "imperial" | "npp";
  /**
   * v5 NPP strategy memory. Written only by the NPP corporation brain, and only
   * for corps it operates. Absent means the loop has not seen this corp yet, in
   * which case it adopts `expand`, whose levers are identical to the pre-v5
   * behaviour. See `src/lib/turn/npp/corpStrategy.ts`.
   */
  nppStrategy?: NppStrategyState;
  /** User who owns this corporation (for quick auth lookups) */
  userId: ObjectId;
  /** Country where corporation is headquartered */
  countryId: CountryId;
  /** State code where corporation is headquartered */
  headquartersState: string;
  /** Cash on hand */
  /** Atomic audit key written with an NPP founding debit; observer publication uses this stamp. */
  nppFoundingCashWitnessKey?: string;
  /** Atomic admission key for landed NPP capacity-build cash history. */
  nppReinvestmentCashWitnessKey?: string;
  liquidCapital: number;
  /** Funded operating proceeds held until current taxes and prior payables settle. Cleared on economy/world reset. */
  pendingOperatingCash?: number;
  /** Unfunded realized operating costs by native liquid currency. */
  operatingCashArrearsByCurrency?: Partial<Record<CurrencyCode, number>>;
  /** Latest turn that added an operating payable for each currency. */
  operatingCashArrearsLastTurnByCurrency?: Partial<Record<CurrencyCode, number>>;
  /** Unpaid federal withholding liabilities in anchor units by country. */
  federalTaxArrearsAnchorByCountry?: Partial<Record<CountryId, number>>;
  /** Latest turn that added a tax payable for each country. */
  federalTaxArrearsLastTurnByCountry?: Partial<Record<CountryId, number>>;
  /**
   * Court-ordered compensation recoveries this corporation owes, keyed by
   * `<sectorId>_<takenAtTurn>`, until each one is fully settled.
   */
  pendingCompensationRecoveries?: Record<
    string,
    {
      sectorId: ObjectId;
      takenAtTurn: number;
      countryId: string;
      anchor: number;
      /** `debited` once the cash has left the corporation and awaits the treasury credit. */
      stage: "pending" | "debited";
      paidAnchor?: number;
    }
  >;
  /**
   * Currency denomination of liquidCapital.
   * Set during forex migration to the corp's home currency.
   * Absent on pre-forex corps, treat as USD.
   */
  liquidCurrencyCode?: CurrencyCode;
  /**
   * How player/corp sells back into the public float settle (v0.2.x).
   * "instant" (default): float buys credit liquidCapital, sells debit it (gated).
   * "escrow": float buys credit shareEscrowBalance, sells debit it (may go negative).
   */
  shareBuybackMode?: "instant" | "escrow";
  /**
   * Market-making escrow balance, in liquidCurrencyCode units. May be negative
   * (a tracked buyback debt). Credited by float buys, debited by float sells in
   * escrow mode; funded by the CEO per turn; settled at dissolution/buyout.
   */
  shareEscrowBalance?: number;
  /** Local-currency amount moved from liquidCapital into escrow each turn (>= 0). */
  escrowFundingPerTurn?: number;
  /** Turn of the CEO's last escrow withdrawal (enforces the 24-turn cooldown). */
  lastEscrowWithdrawalTurn?: number;
  /** Marketing spend per turn ($) */
  marketingBudget: number;
  /** Accumulated marketing power */
  marketingStrength: number;
  /** Logistics spend per turn ($) */
  logisticsBudget: number;
  /** Accumulated logistics efficiency (reduces sprawl penalty) */
  logisticsStrength: number;
  /** R&D spend per turn ($) */
  rdBudget?: number;
  /** Accumulated R&D score (drives innovation probability and boost magnitude) */
  rdScore?: number;
  /** Daily CEO salary paid from liquid capital to CEO's cashOnHand (spread over 24 turns) */
  ceoSalary?: number;
  /** Brand color for charts and UI (hex, e.g. "#3b82f6") */
  brandColor?: string;
  /** URL to corporation logo (Vercel Blob or local) */
  logoUrl?: string;
  /** Audit: the controlling parent's CEO last set this AI-run subsidiary's logo. */
  logoSetByParent?: { byCorporationId: ObjectId; byUserId: ObjectId; at: Date };
  /** Wide banner image for the corporation page hero (CEO-set; Vercel Blob or /api/uploads/... ) */
  headerImageUrl?: string;
  /** Sequential ID for stable URLs (e.g., /corporation/1) */
  sequentialId?: number;
  /** Total shares issued */
  totalShares: number;
  /** Current share price in dollars (fundamental × sentiment × orderFlow) */
  sharePrice: number;
  /**
   * Fundamental share price last computed by the political turn (before
   * sentiment and order-flow multipliers). Used by the 15-minute price-
   * update cron to reapply multipliers without a full turn recompute.
   * Absent on legacy corps that have not yet completed a turn.
   */
  fundamentalSharePrice?: number;
  /**
   * Carried order-flow multiplier from the previous 15-minute interval.
   * 1.0 = neutral. Decays 20% toward 1.0 each interval.
   * Absent on legacy corps; treated as 1.0 by the cron.
   */
  orderFlowMultiplier?: number;
  /**
   * Accumulated buy-side dollar volume (in corp's local currency) for the
   * current 15-minute price-update window. Reset to 0 each cron run.
   */
  orderFlowWindowBuyValue?: number;
  /**
   * Accumulated sell-side dollar volume (in corp's local currency) for the
   * current 15-minute price-update window. Reset to 0 each cron run.
   */
  orderFlowWindowSellValue?: number;
  /**
   * Rolling log of annualised after-tax income (₳ anchor) from the last
   * FUNDAMENTAL_ROLLING_AVG_TURNS political turns. Index 0 = oldest, last = most recent.
   * Absent on corps that have not yet completed a turn.
   */
  earningsHistory?: number[];
  /** Array of shareholders */
  shareholders: Shareholder[];
  /** Shares available in the public float (universal market maker pool) */
  publicFloat?: number;
  /**
   * Approved primary shares not yet bought by the currency market pool or a
   * direct exchange buyer. For
   * IPOs with issuedUpfront, they are in totalShares and publicFloat, available
   * to buy. Other pending issues are authorized and not yet outstanding.
   */
  pendingShareIssuance?: {
    remainingShares: number;
    requestedShares: number;
    source: "direct" | "vote" | "ipo" | "founding_ipo";
    issuedUpfront?: boolean;
    createdAtTurn: number;
    initialPriceLocal: number;
    underwriting?: import("@/lib/banking/underwritingTypes").PrimaryUnderwritingOffer;
  };
  /**
   * Equity pool sell pacing: the turn of the last pool purchase from sellers of
   * this company and the local-currency value bought that turn. See
   * `src/lib/equities/blockPacing.ts`.
   */
  poolSellAbsorbedTurn?: number;
  poolSellAbsorbedLocal?: number;
  /** Dividend payout rate (0, 100%). Income × this % is distributed to shareholders each turn. */
  dividendRate?: number;
  /** When the dividend rate was last changed (enforces 24h cooldown) */
  lastDividendChange?: Date;
  /** When shares were last issued (public or self-issue; enforces 24h cooldown) */
  lastShareIssuance?: Date;
  /**
   * Turn an NPP-run corp last launched an autonomous sector attack (NPP-autonomy
   * V2.2 cooldown). Absent ⇒ never attacked. Spaces out aggression so an
   * autonomous corp telegraphs and cannot barrage a rival every turn.
   */
  lastAutoAttackTurn?: number;
  /**
   * Turn this corp was last hit by an autonomous NPP sector attack, from any
   * attacker. The counterpart to `lastAutoAttackTurn`: that one bounds how often
   * a given NPP corp attacks, this one bounds how often a given corp is attacked.
   * Without it nothing stopped several NPP corps striking the same player-owned
   * defender on the same turn, each with its own wire headline and notification.
   */
  lastAutoAttackedTurn?: number;
  /** Game turn when shares last underwent a CEO stock split / reverse split (cooldown) */
  lastShareStructureTurn?: number | null;
  /** Split escalation level, MS cost per split is 2^splitEscalation. Decays by 1 each turn. */
  splitEscalation?: number;
  /**
   * Management overhead (margin points) applied last turn, on the control-group
   * basis when gameConfig.groupSizeCostsStage is on. Written by the turn.
   */
  managementOverheadPp?: number;
  /** Whether the CEO position is currently vacant (resigned or no CEO accepted yet) */
  ceoVacant?: boolean;
  /** Turn when the CEO position became vacant (for display in admin UI) */
  ceoVacantSinceTurn?: number;
  /**
   * Turn the corp first entered FINANCIAL distress (liquidCapital < 0 or a
   * defaulted bond), uncured. Stamped/cleared each turn by the corporation turn
   * phase. Drives the executive-nationalization grace window + at-risk badge.
   * Absent ⇒ not currently in financial distress.
   */
  financialDistressSinceTurn?: number;
  /**
   * Turn an NPP corp's effective cash (liquidCapital + positive share escrow,
   * anchor-converted) first went negative, uncured. Stamped/cleared each turn;
   * if still set after PERSISTENT_INSOLVENCY_GRACE_TURNS the corp is wound down.
   * Only set on `ceoType: "npp"` corps; player corps use
   * financialDistressSinceTurn instead.
   */
  nppInsolventSinceTurn?: number;
  /**
   * Append-only log of CEO tenures. An open tenure (no endTurn) is the sitting
   * CEO. Blocks a former CEO from buying corp bonds for
   * EX_CEO_BOND_PURCHASE_BLOCK_TURNS after leaving.
   */
  ceoHistory?: CeoTenure[];
  /** Whether the corporation is suspended from turn processing */
  suspended?: boolean;
  /** Turn after which suspension ends (informational, admin must manually resume) */
  suspendedUntilTurn?: number;
  /** Protected until the owner chooses a playable headquarters after a federation split. */
  federationPendingHeadquartersId?: string;
  /** Character being offered the CEO position (pending acceptance) */
  pendingCeoCharacterId?: ObjectId;
  /**
   * Set while an NPP caretaker runs this player-owned corp. The autonomy brain
   * operates via `ceoType: "npp"` + `ceoId`, but `userId` stays the appointing
   * owner for private-data access and immediate reclaim. Operational commands
   * reject NPP-run corps. Stores the displaced human CEO for restoration on
   * dismissal. Absent => not caretaker-run.
   */
  caretakerCeo?: {
    /**
     * The human CEO restored as `ceoId` on dismissal. Present for a player-
     * appointed caretaker (the sitting CEO who handed off). Absent when the
     * caretaker was auto-installed onto a corp whose human CEO had already
     * departed with no character left to restore (e.g. retirement), dismissal
     * then returns the corp to `ceoVacant` rather than seating a ghost.
     */
    underlyingCharacterId?: ObjectId;
    /** That CEO's owning user; restored to `userId` on dismissal (already equal while active). */
    underlyingUserId: ObjectId;
    /** Turn the caretaker was installed. */
    appointedTurn: number;
    /** Whether the owner chose the caretaker or the turn loop filled a vacancy. */
    appointmentSource?: "owner" | "vacancy";
    /** Owner-selected operating mandate. Legacy caretakers default to active. */
    mandate?: "active" | "passive";
  };
  /**
   * Turn until which a new caretaker may not be installed, stamped when the owner
   * reclaims control. Enforces CARETAKER_REAPPOINT_COOLDOWN_TURNS. Absent or
   * in the past means no cooldown.
   */
  caretakerCooldownUntilTurn?: number;
  /**
   * Owner-enabled autopilot. The player stays CEO: `ceoType:"character"` and manual commands still work. Each turn the cautious NPP brain runs budgets, dividends, capacity and divestment, and records moves it judged worthwhile but will not make as `advisories`. Absent means the player runs the corp.
   */
  autopilot?: CorporationAutopilot;
  /** Owner limits on the NPP operator running this corporation. */
  operatorPolicy?: CorporationOperatorPolicy;
  /** Banked tax losses offsetting up to 80% of later taxable profit (anchor). */
  taxLossCarryforward?: import("@/lib/corporations/rules/lossCarryforward").LossCarryforwardState;
  /** NPP CEO career and pay demands (only while ceoType is "npp"). */
  ceoPay?: CorporationCeoPay;
  /**
   * A Subsidiary Limits or Foreign Investment Act order against this company:
   * its controlling group must give up control by `dueTurn`, or the excess
   * stake is sold at book value into the equity market. Cleared when cured.
   */
  /**
   * An open Competition Act breakup case against this group root (levels 3
   * and 4). The competition authority orders a breakup or dismisses it by
   * `decideByTurn`; undecided cases resolve on the measured share then.
   */
  antitrustCase?: {
    countryId: string;
    sectorType: string;
    sharePercent: number;
    thresholdPercent: number;
    openedTurn: number;
    decideByTurn: number;
    decision?: "order" | "dismiss";
    decidedTurn?: number;
  };
  antitrustDivestiture?: {
    reason: "subsidiaryCap" | "foreignBan" | "foreignShareCap";
    countryId: string;
    rootCorporationId: string;
    sinceTurn: number;
    dueTurn: number;
  };
  /** Country owner for state-owned / nationalized corporations */
  countryOwnerId?: CountryId;
  /** Hide the corporation from stock-exchange style equity listings */
  hiddenFromExchange?: boolean;
  /** Route operating profits into a named budget revenue line */
  budgetRevenueKey?: "healthcareIncome" | "other";
  /** Multiplier applied when converting corporation profit into budget revenue */
  budgetRevenueMultiplier?: number;
  /** Applies the nationalized corporation margin penalty */
  isNationalized?: boolean;
  /**
   * Ownership lifecycle state (nationalization subsystem). Absence ⇒ "private"
   * for back-compat. `isStateOwned()` is the canonical reader, do not branch on
   * this field directly. Set "stateOwned" only on the per-country National
   * Corporation.
   */
  ownershipState?: "private" | "stateOwned";
  /** Turn this corp was last nationalized. Powers the re-nationalization cooldown (P4+). */
  nationalizedAtTurn?: number;
  /** Stable mode marker for an interrupted funded whole-corporation taking. */
  pendingFundedNationalization?: { operationKey: string };
  /**
   * Turn this corp was spun out of a National Corporation (privatization). Powers
   * the re-nationalization cooldown (spec §13.4). Distinct from `lastPrivatizationTurn`
   * (the CEO take-private buyout anchor), do not conflate.
   */
  privatizedAtTurn?: number;
  /**
   * State-retained golden-share fraction (0, 1) for a spun-out corp, held as a
   * reserved block by the country's primary National Corporation (spec §13.4).
   */
  goldenSharePercent?: number;
  /**
   * True for the country's primary National Corporation (the seeded/original
   * one). The primary holds every sector type not claimed by a split-off and is
   * the sovereign-bond issuer. Exactly one per country (spec §24.1).
   */
  isPrimaryNationalCorporation?: boolean;
  /**
   * Sector types a National Corporation exclusively owns and routes future
   * nationalizations of. Empty/absent on the primary means "the remainder" (all
   * types not claimed by a split-off). A secondary split-off carries exactly one
   * entry. (spec §24.1)
   */
  assignedSectorTypes?: OperatingSectorType[];
  /** CEO-set share of per-turn operating profit retained in the corp (0, 75). Absent ⇒ 0. (spec P6g §5.1) */
  profitRetentionPercent?: number;
  /** Finance-minister-set per-turn cap on the CEO's treasury draw (local). Absent ⇒ default; 0 ⇒ frozen. (P6g §5.2) */
  treasuryDrawCap?: number;
  /** Cumulative treasury drawn in `treasuryDrawTurn` (enforces the per-turn cap). (P6g §5.2) */
  treasuryDrawnThisTurn?: number;
  /** Turn that `treasuryDrawnThisTurn` applies to. (P6g §5.2) */
  treasuryDrawTurn?: number;
  /**
   * CEO-set per-turn modernization (R&D) budget in the corp's local currency.
   * Each turn the SOE phase debits this from `liquidCapital` (only when
   * affordable) and adds it to `rdScore`. Absent / 0 ⇒ no recurring R&D spend.
   */
  rdBudgetPerTurn?: number;
  /**
   * Command Economy v2 (P0): per-SOE planned-economy state. Present only on
   * state-owned enterprises seeded for a command country while
   * `commandEconomyEnabled` is on (one SOE per commanding-height sector);
   * absent on every market corporation, so market worlds stay byte-identical.
   * The corp/sector plumbing (commodity supply, budgets, shadow ledger) is
   * unchanged: this is an overlay the command-economy phase reads/writes.
   * See @/lib/economy/soe and the design doc
   * `command-economy-v2-playable-planned-economies`.
   */
  soe?: SoeState;
  /** SOE operating posture default; sectors may override (spec §11.4). */
  soeMandate?: SoeMandate;
  /**
   * While currentTurn is below this value, corporate credit is floored after a bond default.
   * Set to turn + BOND_DEFAULT_CREDIT_PENALTY_TURNS when any bond defaults; cleared after expiry.
   */
  bondDefaultCreditPenaltyUntilTurn?: number | null;
  /**
   * Lifetime count of successful bond-default refinances. Capped by MAX_BOND_DEFAULT_REFINANCES
   * to prevent chronic default → refi cycles from extracting cash via principal roll-overs.
   */
  bondDefaultRefinanceCount?: number;
  /** Turn when the corporation was last renamed (enforces 48-turn cooldown). */
  lastRenameTurn?: number | null;
  /**
   * Cumulative proceeds from share issuances (public float, self-issue, IPO).
   * Stored in the corp's home currency for cash-flow audit and reversal. The
   * share-price formula values the retained liquidCapital directly; issuance
   * dilution is applied when the share count changes.
   */
  shareIssuanceProceeds?: number;
  /**
   * What the system equity pool paid for this company's new shares, per turn,
   * over the last 48 turns. Written only while
   * gameConfig.equityCashoutLimitsStage is on; bounds cumulative placements.
   */
  primaryPoolPlacements?: { turn: number; paidLocal: number }[];
  /** When the CEO last sent a shareholder address (12-hour cooldown). */
  lastShareholderAddressAt?: Date;
  /** Guards the CEO quick-dissolve route against duplicate payout submits. */
  dissolutionInProgressAt?: Date;
  /** Guards bond-settlement routes so one issuer cannot be settled twice in parallel. */
  bondSettlementInProgressAt?: Date;
  /** Denormalized credit metrics (updated each corporation turn). */
  creditCompositeSnapshot?: number;
  creditRatingSnapshot?: string;
  creditSnapshotTurn?: number;
  /**
   * Brand loyalty (Package A, `brandLoyaltyEnabled`): 0, 100 reputation earned by
   * consistent pricing + delivery, protecting a relative slice of demand in
   * clearing. Player-facing as a hidden 5-label scale (see loyaltyLabel);
   * the raw number is admin-only. Absent ⇒ 0. See src/lib/market/brandLoyalty.ts.
   */
  brandLoyalty?: number;
  /**
   * EMA of the corp's own revenue-weighted posture, its established price
   * identity. Gouging/erratic penalties are judged against THIS, not the market.
   * Absent ⇒ seeded to the current posture on first processing.
   */
  brandPostureNorm?: number;
  /**
   * Denormalized revenue-weighted mean of per-sector output quality (0, 100,
   * `brandLoyaltyEnabled` + quality pillars). Display + charts; also snapshotted
   * into corporationHistory. Absent until quality pillars (Package B) are live.
   */
  averageQuality?: number;
  /** Project-bound cash receipt written beside the R&D cash debit while product lines v2 is on. */
  manufacturingProductDevelopmentReceiptV2?: ManufacturingDevelopmentCashReceiptV2;
  manufacturingProductAdvertisingObligationsV2?: ManufacturingProductAdvertisingObligationV2[];
  manufacturingProductAdvertisingReceiptV2?: ManufacturingProductAdvertisingReceiptV2;
  mediaProductDevelopmentReceiptV1?: MediaProductDevelopmentReceipt;
  /** Per-venture funding receipts, keyed by venture id; written beside each cash debit. */
  productVentureDebitsV1?: Record<
    string,
    {
      turn: number;
      amountAnchor: number;
      investmentAnchor: number;
      chargeAnchor: number;
      /** Exact liquidCapital debited, so a refund never depends on a later FX rate. */
      localAmount?: number;
    }
  >;
  mediaProductAdvertisingReceiptV1?: MediaProductAdvertisingReceipt;
  /** Frozen original buyer quote, including seller allocations, until durable settlement completes. */
  mediaProductAdvertisingObligationsV1?: MediaProductAdvertisingObligationV1[];
  /** Idempotency stamp for a corporation participating in a media ad-market cash write. */
  advertisingMarketSettledTurnV1?: number;
  mediaProductDevelopmentPaidTurnV1?: number;
  /** Idempotency stamp retained after its project-bound cash receipt is consumed. */
  manufacturingProductDevelopmentPaidTurnV2?: number;
  creditRatingComponents?: {
    debtToEquity: number;
    interestCoverage: number;
    profitability: number;
    liquidity: number;
  };
  /**
   * IMF restructuring (admin bailout): dilution + amortizing facility; blocks refinance,
   * dividends, and CEO pay while active.
   */
  imfBailoutActive?: boolean;
  /** Canonical IMF institution corporation that receives equity and facility remittances. */
  imfBailoutImfCorporationId?: ObjectId;
  /** Target IMF fully diluted ownership % set at bailout (0, 100). */
  imfBailoutTargetOwnershipPercent?: number;
  imfBailoutStartedAt?: Date;
  /** Remaining IMF facility principal (₳ anchor). Vanilla issuer bonds are removed on bailout. */
  imfFacilityPrincipalOutstanding?: number;
  /** Annual interest rate on outstanding facility principal (%). */
  imfFacilityAnnualRate?: number;
  /** Turns left on the amortization schedule (decrements as principal pays down). */
  imfFacilityAmortizationTurnsRemaining?: number;
  /** Share of per-turn operating income (capped, typically ≤0.45) for IMF facility payment. */
  imfFacilityIncomeCaptureFraction?: number;
  /**
   * When true, this corporation is the global IMF institution (USD balance sheet, hidden from exchange).
   */
  imfInstitution?: boolean;
  /**
   * When true, financial fields (treasury, income, dividends, share price, etc.) are
   * redacted for non-CEO viewers. Set at founding (private path or post-privatization)
   * and cleared on IPO. Absent on legacy corps, treat as false (public).
   */
  isPrivate?: boolean;
  /**
   * Turn until which this corporation's real financials are public, because a
   * foreign intelligence service leaked them.
   *
   * While set and unexpired, `financialFogOfWar` is skipped for every viewer:
   * the books are simply out. Absent or past means the ordinary quarterly fog
   * applies. Deliberately a turn rather than a boolean so the exposure lapses on
   * its own and nothing has to remember to clear it.
   */
  booksExposedUntilTurn?: number;
  /**
   * Game turn when the corporation was founded. Used as the anchor for the
   * late-IPO cooldown so a freshly-founded private corp can't immediately go
   * public. Absent on legacy corps; in practice they were founded long enough
   * ago that the cooldown is moot.
   */
  foundedAtTurn?: number;
  /** Turn the corp last transitioned private→public via IPO (founding IPO sets this to 0). */
  lastIpoTurn?: number;
  /** Turn the corp last transitioned public→private via buyout vote pass. */
  lastPrivatizationTurn?: number;
  /** Turn after which another privatization vote may be opened (set when a vote fails or expires). */
  privatizationCooldownUntilTurn?: number;
  /**
   * Dual-class supershare vote multiplier. Present once the corp adopts
   * supershares (at IPO or by `adopt_supershares` vote); each of the founder's
   * supershares counts as this many votes in shareholder votes. Absent =
   * single-class, one share one vote. See lib/corporations/superShares.
   */
  superShareMultiplier?: number;
  /** Turn the dual-class supershare structure was adopted. */
  superSharesAdoptedAtTurn?: number;
  /**
   * Sector tech-tree node ids the CEO has unlocked (see lib/constants/techTree).
   * Effects are derived from this set each turn, never persisted as mutated
   * margins. Includes free auto-granted corporate nodes for late-era corps.
   * Absent ⇒ none.
   */
  unlockedTechNodeIds?: string[];
  /**
   * Committed lane per decade tier (v2): "generic" (Corporate) or "sector"
   * (Specialist). Set when the first node of a decade is unlocked; cleared by
   * Abandon. Locks the other lane for that decade. Keyed by decade id ("2019").
   */
  techDecadeLane?: Record<string, "generic" | "sector">;
  /**
   * Turn each decade tier's lane was first committed, keyed by decade id.
   * Audit / future cooldown anchor; absent on corps that have unlocked nothing.
   */
  techDecadeChosenTurn?: Record<string, number>;
  /**
   * rdScore this corporation has spent on frontier research: nodes of the
   * 2039 tier onward plus frontier programmes. Summed per lane it is the world
   * research that opens breakthrough methods (lib/constants/techTree/breakthrough).
   * Never decremented except to reverse a failed unlock. Absent ⇒ 0.
   */
  frontierResearchSpent?: number;
  /**
   * Frontier programmes bought after the last authored tier, by kind
   * (lib/constants/techTree/frontier). Their effects apply to the primary
   * sector every turn and never expire. Absent ⇒ none.
   */
  frontierProgrammes?: { output?: number; input?: number };
  /** Legal structure of this corporation (e.g. "us_c_corp"). Absent = country default. */
  legalStructure?: import("../../constants/legalStructures").LegalStructureId;
  /** Turn after which the legal structure may be changed again (instant-change cooldown for private corps). */
  legalStructureChangeCooldownUntilTurn?: number;
  /**
   * Subsidiary corporations (feature-gated). Set when the controlling parent
   * formalizes this holding into a managed subsidiary. Presence of this marker
   * (NOT any stored parent id, the relationship is always derived from voting
   * control) enables subsidiary management UI/actions. Cleared automatically by
   * the turn processor if no corporation controls >50% voting power anymore.
   */
  subsidiaryFormalizedAtTurn?: number;
  /** Optional sourcing policy. Missing means the ordinary market; reset with corporations. */
  internalSupplyPolicy?: import("@/lib/market/internalSupply/rules").InternalSupplyPolicy;

  /** Spin-off provenance (informational: UI labels, history). Phase 2. */
  isSpinOff?: boolean;
  spunOffFromCorpId?: ObjectId;
  /**
   * Turn this corporation was spun off. Only the PARENT recorded a spin-off
   * timestamp before (`lastSpinOffTurn`, a cooldown anchor), so the spun-off
   * corp itself had no age. C6 group synergies need it for the brand
   * inheritance window.
   */
  spunOffAtTurn?: number;
  /**
   * Parent-set dividend floor (percent 0, 100), folded into the existing
   * effective-dividend-rate `max(...)` rule. Only honored while
   * `parentDividendFloorSetByCorpId` still controls >50% voting of this corp;
   * otherwise ignored and cleared by the turn processor. Capped at
   * MAX_DIVIDEND_RATE.
   */
  parentDividendFloorPct?: number;
  parentDividendFloorSetByCorpId?: ObjectId;
  /** Cooldown anchor for spin-offs initiated BY this corp (Phase 2). */
  lastSpinOffTurn?: number;
  /** Per-subsidiary cooldown anchor for parent capital injections into this corp. */
  lastCapitalInjectionTurn?: number;
  /**
   * Divestiture ordered as the remedy on a cleared-with-conditions merger (C3).
   * Satisfied by spinning off the named industry; overdue it fines this corp
   * every turn and bars it from opening new acquisitions.
   */
  pendingDivestiture?: import("./mergerReview").PendingDivestiture;
  /**
   * Offer id currently executing an agreed acquisition against this
   * corporation as the target. Atomic claim: only the owning offer's executor
   * may move money or sectors, which is what stops two concurrently accepted
   * offers for one corporation from both paying out. Dies with the shell on
   * success; released on terminal compensation.
   */
  acquisitionSettlementId?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type { SectorBuildOrder, CorporateSector } from "./corporationSector";
