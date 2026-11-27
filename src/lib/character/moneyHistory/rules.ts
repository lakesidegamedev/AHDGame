import type { FinancialCounterpartyType, FinancialTxType } from "@/lib/db/types/financialTxLog";

/** Plain-language source groups. The client translates each key. */
export type MoneyHistoryKind =
  | "sponsored_post"
  | "office_income"
  | "fundraise"
  | "campaign_donation"
  | "union_contribution"
  | "ceo_salary"
  | "dividend"
  | "bond_purchase"
  | "bond_sale"
  | "bond_coupon"
  | "bond_maturity"
  | "bond_default"
  | "stock_buy"
  | "stock_sell"
  | "stock_order_hold"
  | "stock_order_release"
  | "share_proceeds"
  | "index_fund_in"
  | "index_fund_out"
  | "index_fund_dividend"
  | "forex"
  | "savings_in"
  | "savings_out"
  | "savings_interest"
  | "loan_draw"
  | "loan_repay"
  | "loan_interest"
  | "loan_garnishment"
  | "transfer_in"
  | "transfer_out"
  | "income_tax"
  | "capital_gains_tax"
  | "company_capital"
  | "company_payout"
  | "pension"
  | "party"
  | "crisis"
  | "grant"
  | "reward"
  | "casino"
  | "staff_adjustment"
  | "other";

export type MoneyHistoryWallet = "personal" | "campaign";

const KIND_BY_TYPE: Partial<Record<FinancialTxType, MoneyHistoryKind>> = {
  sponsored_post_payment: "sponsored_post",
  office_income: "office_income",
  fundraise_credit: "fundraise",
  campaign_donation: "campaign_donation",
  union_contribution: "union_contribution",
  corp_salary: "ceo_salary",
  corp_dividend: "dividend",
  bond_purchase: "bond_purchase",
  bond_sell: "bond_sale",
  bond_coupon: "bond_coupon",
  bond_maturity: "bond_maturity",
  bond_default: "bond_default",
  stock_trade_buy: "stock_buy",
  stock_trade_sell: "stock_sell",
  stock_order_escrow: "stock_order_hold",
  stock_order_refund: "stock_order_release",
  share_offer_escrow: "stock_order_hold",
  share_listing_refund: "stock_order_release",
  ipo_proceeds: "share_proceeds",
  stock_self_issue: "share_proceeds",
  share_buyout_payout: "share_proceeds",
  index_fund_subscribe: "index_fund_in",
  index_fund_redeem: "index_fund_out",
  index_fund_dividend: "index_fund_dividend",
  forex_trade: "forex",
  savings_deposit: "savings_in",
  savings_withdrawal: "savings_out",
  savings_interest: "savings_interest",
  loc_draw: "loan_draw",
  loc_repay: "loan_repay",
  loc_interest: "loan_interest",
  loc_garnishment: "loan_garnishment",
  bank_loan_origination: "loan_draw",
  bank_loan_repayment: "loan_repay",
  wire_transfer_in: "transfer_in",
  wire_transfer_out: "transfer_out",
  player_income_tax: "income_tax",
  player_capital_gains_tax: "capital_gains_tax",
  corp_capital_seed: "company_capital",
  corp_capital_injection: "company_capital",
  corp_sector_founding: "company_capital",
  corp_dissolution_distribution: "company_payout",
  pension_contribution: "pension",
  pension_benefit: "pension",
  party_transfer: "party",
  party_dues_received: "party",
  caucus_tax_debit: "party",
  crisis_payout: "crisis",
  crisis_levy: "crisis",
  world_event_payout: "crisis",
  gov_subsidy_paid: "grant",
  gov_grant_paid: "grant",
  referral_reward: "reward",
  onboarding_reward: "reward",
  starting_capital: "reward",
  contest_prize: "reward",
  casino_wager: "casino",
  casino_payout: "casino",
  admin_transfer: "staff_adjustment",
  economy_reset: "staff_adjustment",
  restitution_credit: "staff_adjustment",
  fund_credit: "other",
  fund_debit: "other",
};

/** Types that move campaign funds rather than personal cash. */
const CAMPAIGN_TYPES: ReadonlySet<FinancialTxType> = new Set([
  "office_income",
  "fundraise_credit",
  "campaign_donation",
  "union_contribution",
  "caucus_tax_debit",
]);

/** Counterparties whose names are already public in the game. */
const PUBLIC_COUNTERPARTY_TYPES: ReadonlySet<FinancialCounterpartyType> = new Set([
  "corporation",
  "party",
  "character",
]);

export function moneyHistoryKind(type: FinancialTxType): MoneyHistoryKind {
  return KIND_BY_TYPE[type] ?? "other";
}

/** A row may name its wallet explicitly (for example a split endowment); that wins over the type. */
export function moneyHistoryWallet(
  type: FinancialTxType,
  meta?: Record<string, unknown>
): MoneyHistoryWallet {
  if (meta?.wallet === "campaign" || meta?.wallet === "personal") return meta.wallet;
  return CAMPAIGN_TYPES.has(type) ? "campaign" : "personal";
}

/** Mongo filter fragment selecting one wallet, mirroring `moneyHistoryWallet`. */
export function walletFilter(wallet: MoneyHistoryWallet): Record<string, unknown> {
  const campaign = [...CAMPAIGN_TYPES];
  if (wallet === "campaign") {
    return { $or: [{ "meta.wallet": "campaign" }, { type: { $in: campaign } }] };
  }
  return {
    "meta.wallet": { $ne: "campaign" },
    $or: [{ "meta.wallet": "personal" }, { type: { $nin: campaign } }],
  };
}

export interface MoneyHistorySourceRow {
  type: FinancialTxType;
  turn: number;
  createdAt: Date;
  amount: number;
  currencyCode: string;
  balanceAfter?: number;
  counterpartyType?: FinancialCounterpartyType;
  counterpartyName?: string;
  counterpartyDeletedAt?: Date;
  meta?: Record<string, unknown>;
}

export interface MoneyHistoryRow {
  turn: number;
  at: string;
  kind: MoneyHistoryKind;
  wallet: MoneyHistoryWallet;
  amount: number;
  currencyCode: string;
  /** Present only where the log recorded it. */
  balanceAfter: number | null;
  counterparty: string | null;
}

/** Maps a log row to the fields a player may see. Nothing else leaves the server. */
export function toMoneyHistoryRow(row: MoneyHistorySourceRow): MoneyHistoryRow {
  const publicCounterparty =
    row.counterpartyName &&
    row.counterpartyType &&
    PUBLIC_COUNTERPARTY_TYPES.has(row.counterpartyType) &&
    !row.counterpartyDeletedAt;
  return {
    turn: row.turn,
    at: row.createdAt.toISOString(),
    kind: moneyHistoryKind(row.type),
    wallet: moneyHistoryWallet(row.type, row.meta),
    amount: row.amount,
    currencyCode: row.currencyCode,
    balanceAfter: typeof row.balanceAfter === "number" ? row.balanceAfter : null,
    counterparty: publicCounterparty ? (row.counterpartyName ?? null) : null,
  };
}
