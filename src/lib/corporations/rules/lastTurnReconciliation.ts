/**
 * Last-turn money reconciliation for one company: the recorded result of a
 * turn, the cash that left or arrived outside the income statement, and the
 * change in cash on hand. Plain data in, plain data out; all amounts are per
 * turn in the company's own currency.
 */

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
  /** Cash on hand when the previous turn was recorded, when known. */
  cashBefore: number | null;
  /** Operating costs of the previous recorded turn, when known. */
  previousCosts?: number | null;
}

export interface CashFlowLine {
  key: string;
  label: string;
  /** Signed: negative leaves the company. */
  amount: number;
}

export interface LastTurnReconciliation {
  turn: number;
  statement: {
    revenue: number;
    costs: number;
    /** Operating costs of the turn before; null when unknown. */
    previousCosts: number | null;
    tax: number;
    /** Bond interest and coupons, dividends received and other non-operating items, net. */
    otherNet: number;
    dividendPaid: number;
    retained: number;
  };
  cash: {
    before: number | null;
    after: number;
    /** Null when the opening cash is unknown. */
    change: number | null;
    retained: number;
    lines: CashFlowLine[];
    /** Cash change not explained by retained income or a labelled line. Null when opening cash is unknown. */
    unitemised: number | null;
  };
}

/** Booked inside the income statement or settled with it; never a separate cash line. */
const IN_INCOME_STATEMENT = new Set<string>([
  "producer_market_settlement",
  "producer_market_transfer",
  "corp_revenue",
  "corp_operating_loss",
  "corp_dividend",
  "corp_tax_paid",
  "corp_salary",
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
  stock_self_issue: { key: "share_issue", label: "Share issue proceeds" },
  ipo_proceeds: { key: "share_issue", label: "Share issue proceeds" },
  bond_issuance: { key: "bond_issue", label: "Bond issue proceeds" },
  bond_maturity: { key: "bond_repay", label: "Bond repayments" },
  bond_buyback: { key: "bond_repay", label: "Bond repayments" },
  stock_trade_buy: { key: "investments", label: "Share and bond trading" },
  stock_trade_sell: { key: "investments", label: "Share and bond trading" },
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

/**
 * Tie the recorded income statement to the change in cash. The identity is
 * cash change = retained income + labelled lines + unitemised, and
 * `unitemised` is whatever is left, so a gap shows as a line instead of
 * hiding.
 */
export function reconcileLastTurn(
  recorded: RecordedTurnInput,
  flows: readonly CashFlowInput[]
): LastTurnReconciliation {
  const lines = groupCashFlowLines(flows);
  const otherNet = round2(
    recorded.revenue -
      recorded.totalCosts -
      recorded.tax -
      recorded.dividendPaid -
      recorded.retained
  );
  const change =
    recorded.cashBefore == null ? null : round2(recorded.cashAfter - recorded.cashBefore);
  const labelled = lines.reduce((sum, l) => sum + l.amount, 0);
  const unitemised = change == null ? null : round2(change - recorded.retained - labelled);
  return {
    turn: recorded.turn,
    statement: {
      revenue: recorded.revenue,
      costs: recorded.totalCosts,
      previousCosts: recorded.previousCosts ?? null,
      tax: recorded.tax,
      otherNet,
      dividendPaid: recorded.dividendPaid,
      retained: recorded.retained,
    },
    cash: {
      before: recorded.cashBefore,
      after: recorded.cashAfter,
      change,
      retained: recorded.retained,
      lines,
      unitemised,
    },
  };
}
