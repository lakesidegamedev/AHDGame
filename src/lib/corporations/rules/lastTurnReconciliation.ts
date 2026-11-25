/**
 * Last-turn money reconciliation for one company: the recorded result of a
 * turn, the cash that left or arrived outside the income statement, and the
 * change in cash on hand. Plain data in, plain data out; all amounts are per
 * turn in the company's own currency.
 */

import {
  costDrivers,
  COST_CHANGE_THRESHOLD,
  type CostBreakdown,
  type CostDriver,
} from "./costBreakdown";

/** One cash movement outside the income statement, as logged. */
export interface CashFlowInput {
  type: string;
  amount: number;
}

/** One recorded turn from the company history. */
export interface RecordedTurnInput {
  turn: number;
  revenue: number;
  /** Operating costs, before tax and bond interest. */
  totalCosts: number;
  /** Retained income: after tax, bond flows and dividends. */
  retained: number;
  dividendPaid: number;
  tax: number;
  /** Cash on hand when the turn was recorded. */
  cashAfter: number;
  /** Bond coupons received this turn, in the company's currency. */
  bondCouponIncome?: number | null;
  /** Bond interest paid on the company's own bonds this turn, in the company's currency. */
  bondInterestPaid?: number | null;
  bankLoanInterestPaid?: number | null;
  /** Tax on dividends received: inside `tax`, but already netted from the dividend credit. */
  dividendReceivedTax?: number | null;
  /** Conversion fee skimmed from foreign operating income before retained income. */
  sectorFxSpread?: number | null;
  dividendIncomeReceived?: number;
  /** Cash on hand now, when it should be compared with the recorded figure. */
  cashNow?: number | null;
  /** Cash on hand when the previous turn was recorded, when known. */
  cashBefore: number | null;
  /** Operating costs of the previous recorded turn, when known. */
  previousCosts?: number | null;
  /** Where this turn's operating costs went, when the turn recorded it. */
  costBreakdown?: CostBreakdown | null;
  headcount?: number | null;
  previousCostBreakdown?: CostBreakdown | null;
  previousHeadcount?: number | null;
}

export interface CashFlowLine {
  key: string;
  label: string;
  /** Signed: negative leaves the company. */
  amount: number;
}

/** What the ledger read could not place, so the cash remainder can say what it holds. */
export interface LedgerReadNotes {
  /** Logged movements in another currency that could not be converted. */
  unconverted?: number;
  /** True when the ledger read hit its row limit. */
  truncated?: boolean;
}

export interface LastTurnReconciliation {
  turn: number;
  /** Null identifies an anchor-denominated legacy receipt. */
  reportingCurrency?: string | null;
  statement: {
    revenue: number;
    costs: number;
    /** Operating costs of the turn before; null when unknown. */
    previousCosts: number | null;
    /**
     * What moved operating costs by 10% or more since the turn before, from recorded
     * categories. Empty when the move is small or categories were not recorded.
     */
    costDrivers: CostDriver[];
    /** True when costs moved 10% or more but one of the two turns has no recorded categories. */
    costDriversUnrecorded: boolean;
    tax: number;
    /**
     * Everything between operating result and retained income that is not tax or
     * dividends paid: bond interest and coupons and the rest.
     * Signed: negative reduces retained income.
     */
    otherNet: number;
    /** The recorded parts of `otherNet`; `otherNet` minus these is `otherUnitemised`. */
    otherParts: CashFlowLine[];
    otherUnitemised: number;
    /** Plain name for `otherUnitemised`: what it can hold, never "unexplained". */
    otherUnitemisedLabel: string;
    dividendPaid: number;
    retained: number;
  };
  cash: {
    evidence?: { boundary: "recorded" | "estimated" | "turn"; unconvertedMovements: number };
    before: number | null;
    after: number;
    /** Cash on hand now, when it has moved since the turn was recorded; otherwise null. */
    now: number | null;
    /** Null when the opening cash is unknown. */
    change: number | null;
    retained: number;
    lines: CashFlowLine[];
    /** Cash change not explained by retained income or a labelled line. Null when opening cash is unknown. */
    unitemised: number | null;
    /** Plain name and explanation for `unitemised`. */
    unitemisedLabel: string;
    unitemisedNote: string;
  };
}

/** Booked inside the income statement or settled with it; never a separate cash line. */
const IN_INCOME_STATEMENT = new Set<string>([
  "producer_market_settlement",
  "producer_market_transfer",
  "corp_revenue",
  "corp_operating_loss",
  "corp_tax_paid",
  "corp_salary",
  "corp_dividend",
  "bond_coupon",
  "pension_contribution",
  "pension_benefit",
]);

const LINE_GROUPS: Record<string, { key: string; label: string }> = {
  corp_capacity_build: { key: "construction", label: "Construction spending" },
  corp_capacity_build_refund: { key: "construction", label: "Construction spending" },
  corp_sector_founding: { key: "founding", label: "Founding a sector" },
  corp_sector_purchase: { key: "sector_purchase", label: "Sector purchases" },
  corp_sector_sale: { key: "sector_sale", label: "Sector sales" },
  corp_capital_seed: { key: "capital", label: "Capital added or withdrawn" },
  corp_capital_injection: { key: "capital", label: "Capital added or withdrawn" },
  corp_starting_grant: { key: "capital", label: "Capital added or withdrawn" },
  corp_escrow_funding: { key: "escrow", label: "Share buyback escrow" },
  corp_escrow_withdrawal: { key: "escrow", label: "Share buyback escrow" },
  corp_tech_unlock: { key: "tech", label: "Technology unlocks" },
  corp_sector_retool: { key: "retool", label: "Sector retooling" },
  corp_prospecting_cost: { key: "prospecting", label: "Prospecting surveys" },
  contract_signing_fee: { key: "contract_fee", label: "Contract fees" },
  contract_royalty_payment: { key: "contract_fee", label: "Contract fees" },
  corp_sector_split_cost: { key: "campaign", label: "Sector campaign costs" },
  corp_union_busting_cost: { key: "campaign", label: "Sector campaign costs" },
  corp_fine: { key: "fine", label: "Fines" },
  index_listing_lobbying: { key: "lobbying", label: "Listing lobbying" },
  privatization_ipo_proceeds: { key: "share_issue", label: "Share issue proceeds" },
  stock_self_issue: { key: "share_issue", label: "Share issue proceeds" },
  ipo_proceeds: { key: "share_issue", label: "Share issue proceeds" },
  bond_issuance: { key: "bond_issue", label: "Bond issue proceeds" },
  bank_loan_repayment: { key: "bank_loan_repay", label: "Bank loan repayments" },
  bond_maturity: { key: "bond_repay", label: "Bond repayments" },
  bond_buyback: { key: "bond_repay", label: "Bond repayments" },
  bond_default: { key: "bond_repay", label: "Bond repayments" },
  bond_dissolution_payout: { key: "bond_repay", label: "Bond repayments" },
  stock_trade_buy: { key: "investments", label: "Share and bond trading" },
  stock_trade_sell: { key: "investments", label: "Share and bond trading" },
  stock_order_escrow: { key: "investments", label: "Share and bond trading" },
  stock_order_refund: { key: "investments", label: "Share and bond trading" },
  nationalization_held_equity_credit: { key: "investments", label: "Share and bond trading" },
  bond_purchase: { key: "investments", label: "Share and bond trading" },
  bond_sell: { key: "investments", label: "Share and bond trading" },
  admin_transfer: { key: "adjustment", label: "Staff adjustments" },
  restitution_credit: { key: "adjustment", label: "Staff adjustments" },
  corp_dissolution_distribution: { key: "dissolution", label: "Dissolution payout" },
  corp_group_relief: { key: "group_relief", label: "Group tax relief" },
  defence_contract_payment: { key: "defence", label: "Defence contract payments" },
  corp_supply_agreement: { key: "supply_agreement", label: "Supply agreement settlements" },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Group logged cash movements into labelled lines. Types booked inside the
 * income statement are dropped so nothing counts twice; a type with no label
 * falls into one "Other logged movements" line rather than vanishing.
 */
export function groupCashFlowLines(flows: readonly CashFlowInput[]): CashFlowLine[] {
  const byKey = new Map<string, CashFlowLine>();
  for (const flow of flows) {
    if (!Number.isFinite(flow.amount) || flow.amount === 0) continue;
    if (IN_INCOME_STATEMENT.has(flow.type)) continue;
    const group = LINE_GROUPS[flow.type] ?? {
      key: "other_logged",
      label: "Other logged movements",
    };
    const existing = byKey.get(group.key);
    if (existing) existing.amount += flow.amount;
    else byKey.set(group.key, { key: group.key, label: group.label, amount: flow.amount });
  }
  return [...byKey.values()]
    .map((l) => ({ ...l, amount: round2(l.amount) }))
    .filter((l) => l.amount !== 0)
    .sort((a, b) => a.amount - b.amount);
}

function unitemisedWording(ledger: LedgerReadNotes): {
  unitemisedLabel: string;
  unitemisedNote: string;
} {
  const causes: string[] = [];
  if (ledger.unconverted) {
    causes.push(
      `${ledger.unconverted} logged movement${ledger.unconverted === 1 ? "" : "s"} in another currency, converted at the turn's rate`
    );
  }
  if (ledger.truncated) causes.push("ledger rows beyond the first 500 for the turn");
  causes.push("rounding of each recorded figure to whole units");
  return {
    unitemisedLabel: ledger.truncated
      ? "Ledger rows not shown, and rounding"
      : ledger.unconverted
        ? "Currency conversion and rounding"
        : "Rounding and currency conversion",
    unitemisedNote: `Cash change left after retained income and the lines above. It can only hold: ${causes.join("; ")}.`,
  };
}

/**
 * Tie the recorded income statement to the change in cash. The identity is
 * cash change = retained income + labelled lines + unitemised, and
 * `unitemised` is whatever is left, so a gap shows as a line instead of
 * hiding.
 */
export function reconcileLastTurn(
  recorded: RecordedTurnInput,
  flows: readonly CashFlowInput[],
  ledger: LedgerReadNotes = {}
): LastTurnReconciliation {
  const lines = groupCashFlowLines(flows);
  const otherNet = round2(
    recorded.retained -
      (recorded.revenue - recorded.totalCosts - recorded.tax - recorded.dividendPaid)
  );
  const otherParts: CashFlowLine[] = [
    {
      key: "bond_interest",
      label: "Interest paid on bonds issued",
      amount: -Math.max(0, recorded.bondInterestPaid ?? 0),
    },
    {
      key: "bank_loan_interest",
      label: "Interest paid on bank loans",
      amount: -Math.max(0, recorded.bankLoanInterestPaid ?? 0),
    },
    {
      key: "bond_coupons",
      label: "Coupons received on bonds held",
      amount: Math.max(0, recorded.bondCouponIncome ?? 0),
    },
    {
      key: "dividend_tax",
      label: "Tax on dividends received (counted in tax above, not taken from retained income)",
      amount: Math.max(0, recorded.dividendReceivedTax ?? 0),
    },
    {
      key: "fx_spread",
      label: "Currency conversion fee on foreign income",
      amount: -Math.max(0, recorded.sectorFxSpread ?? 0),
    },
    {
      key: "dividends_received",
      label: "Dividends received on shares held",
      amount: Math.max(0, recorded.dividendIncomeReceived ?? 0),
    },
  ]
    .map((l) => ({ ...l, amount: round2(l.amount) }))
    .filter((l) => l.amount !== 0);
  const otherUnitemised = round2(otherNet - otherParts.reduce((sum, l) => sum + l.amount, 0));
  const change =
    recorded.cashBefore == null ? null : round2(recorded.cashAfter - recorded.cashBefore);
  const previousCosts = recorded.previousCosts ?? null;
  const bigMove =
    previousCosts != null &&
    previousCosts > 0 &&
    Math.abs(recorded.totalCosts - previousCosts) / previousCosts >= COST_CHANGE_THRESHOLD;
  const drivers =
    bigMove && previousCosts != null
      ? costDrivers(
          {
            turn: recorded.turn - 1,
            totalCosts: previousCosts,
            costBreakdown: recorded.previousCostBreakdown,
            headcount: recorded.previousHeadcount,
          },
          {
            turn: recorded.turn,
            totalCosts: recorded.totalCosts,
            costBreakdown: recorded.costBreakdown,
            headcount: recorded.headcount,
          }
        )
      : [];
  const splitRecorded = recorded.dividendReceivedTax != null || recorded.sectorFxSpread != null;
  const labelled = lines.reduce((sum, l) => sum + l.amount, 0);
  const unitemised = change == null ? null : round2(change - recorded.retained - labelled);
  return {
    turn: recorded.turn,
    statement: {
      revenue: recorded.revenue,
      costs: recorded.totalCosts,
      previousCosts,
      costDrivers: drivers,
      costDriversUnrecorded: bigMove && !(recorded.costBreakdown && recorded.previousCostBreakdown),
      tax: recorded.tax,
      otherNet,
      otherParts,
      otherUnitemised,
      otherUnitemisedLabel: splitRecorded
        ? "Rounding of recorded figures"
        : "Tax on dividends received, currency conversion and rounding",
      dividendPaid: recorded.dividendPaid,
      retained: recorded.retained,
    },
    cash: {
      before: recorded.cashBefore,
      after: recorded.cashAfter,
      now:
        recorded.cashNow != null && Math.round(recorded.cashNow) !== Math.round(recorded.cashAfter)
          ? recorded.cashNow
          : null,
      change,
      retained: recorded.retained,
      lines,
      unitemised,
      ...unitemisedWording(ledger),
    },
  };
}
