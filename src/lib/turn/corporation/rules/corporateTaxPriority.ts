import { RETAINED_PROFIT_SHARE } from "@/lib/market/producerMarket/profitDistributionRules";

/** Reserve current taxes before old payables or spendable corporate cash. */
export function planCorporateTaxPriority(input: {
  cash: number;
  pending: number;
  netIncome: number;
  localPerAnchor: number;
  currentTax: Readonly<Record<string, number>>;
  priorTax: Readonly<Record<string, number>>;
  priorOperating: number;
  priorOperatingByCurrency?: Readonly<Record<string, { amount: number; localPerAnchor: number }>>;
  distributionRequested?: number;
  /**
   * gameConfig.nppDividendAfterTaxStage >= 1. The request is sized on pre-tax
   * profit (profitDistributionRules); take the distributed share of this turn's
   * current tax off it, pay none while opening cash is negative, and never pay
   * it out of opening cash.
   */
  distributionAfterTax?: boolean;
}) {
  const { cash, pending, netIncome, localPerAnchor } = input;
  for (const row of Object.values(input.priorOperatingByCurrency ?? {}))
    if (
      !Number.isFinite(row.amount) ||
      row.amount < 0 ||
      !Number.isFinite(row.localPerAnchor) ||
      row.localPerAnchor <= 0
    )
      throw new Error("Invalid operating arrears currency");
  const priorOperating = input.priorOperatingByCurrency
    ? Object.values(input.priorOperatingByCurrency).reduce(
        (sum, row) => sum + (row.amount / row.localPerAnchor) * localPerAnchor,
        0
      )
    : input.priorOperating;
  if (
    ![cash, pending, netIncome, localPerAnchor, priorOperating].every(Number.isFinite) ||
    pending < 0 ||
    localPerAnchor <= 0 ||
    priorOperating < 0
  )
    throw new Error("Invalid corporate settlement cash");
  for (const amounts of [input.currentTax, input.priorTax])
    if (Object.values(amounts).some((amount) => !Number.isFinite(amount) || amount < 0))
      throw new Error("Invalid corporate tax payable");
  const due = Object.values(input.currentTax).reduce((sum, amount) => sum + amount, 0);
  const gross = netIncome + due * localPerAnchor;
  const opening = cash + pending + Math.max(0, gross);
  let available = Math.max(0, opening);
  const allocate = (amounts: Readonly<Record<string, number>>) => {
    const total = Object.values(amounts).reduce((sum, amount) => sum + amount, 0);
    const paid = Math.min(total, available / localPerAnchor);
    const ratio = total > 0 ? paid / total : 0;
    available = Math.max(0, available - paid * localPerAnchor);
    return Object.fromEntries(
      Object.entries(amounts).map(([country, amount]) => [country, amount * ratio])
    );
  };
  const currentPaid = allocate(input.currentTax);
  const operatingDue = Math.max(0, -gross);
  const operatingPaid = Math.min(available, operatingDue);
  available = Math.max(0, available - operatingPaid);
  const priorTaxPaid = allocate(input.priorTax);
  const priorOperatingPaid = Math.min(available, priorOperating);
  available = Math.max(0, available - priorOperatingPaid);
  const requested = input.distributionRequested ?? 0;
  if (!Number.isFinite(requested) || requested < 0)
    throw new Error("Invalid corporate distribution");
  // A 60% payout of pre-tax profit on top of a 52-57% tax paid out more than the
  // profit: 86 AI companies profitable at plant level went to zero cash and their
  // plants stopped (turns 705-712). After tax the company keeps its retained share.
  const distributionRequested = !input.distributionAfterTax
    ? requested
    : cash < 0
      ? 0
      : Math.max(0, requested - (1 - RETAINED_PROFIT_SHARE) * due * localPerAnchor);
  const distributionCap = input.distributionAfterTax
    ? Math.max(0, available - Math.max(0, cash))
    : available;
  const distributionPaid = Math.min(distributionCap, distributionRequested);
  available = Math.max(0, available - distributionPaid);
  return {
    cash: Math.min(0, opening) + available,
    distributionPaid,
    currentPaid,
    priorTaxPaid,
    currentUnpaid: Object.fromEntries(
      Object.entries(input.currentTax).map(([country, amount]) => [
        country,
        Math.max(0, amount - (currentPaid[country] ?? 0)),
      ])
    ),
    operatingUnpaid: Math.max(0, operatingDue - operatingPaid),
    priorOperatingPaid,
    priorOperatingPaidByCurrency: Object.fromEntries(
      Object.entries(input.priorOperatingByCurrency ?? {}).map(([currency, row]) => [
        currency,
        priorOperating > 0 ? (row.amount * priorOperatingPaid) / priorOperating : 0,
      ])
    ),
    operatingPaid,
    gross,
  };
}

/** Known payables must not fund dividends, buybacks or optional expansion. */
export function hasCorporateCashPayables(input: {
  operatingCashArrearsByCurrency?: Readonly<Record<string, number>>;
  federalTaxArrearsAnchorByCountry?: Readonly<Record<string, number>>;
}) {
  return [input.operatingCashArrearsByCurrency, input.federalTaxArrearsAnchorByCountry].some(
    (amounts) =>
      Object.values(amounts ?? {}).some((amount) => Number.isFinite(amount) && amount > 1e-8)
  );
}

/** Only unencumbered opening cash may fund decisions before settlement finishes. */
export function corporateDecisionCash(input: Parameters<typeof planCorporateTaxPriority>[0]) {
  return Math.max(0, Math.min(input.cash, planCorporateTaxPriority(input).cash));
}

/** Hold optional legacy reinvestment while payables are outstanding; plants remain physical. */
export function corporateGrowthWithPayables<
  T extends {
    newCurrentGrowthRate: number;
    perTurnGrowthRate: number;
    newRevenue: number;
    preFlipNameplateRevenue: number;
  },
>(
  policy: T,
  corp: Parameters<typeof hasCorporateCashPayables>[0],
  openingRevenue: number,
  plantsEnabled: boolean
): T {
  return !plantsEnabled && hasCorporateCashPayables(corp)
    ? {
        ...policy,
        newCurrentGrowthRate: 0,
        perTurnGrowthRate: 0,
        newRevenue: openingRevenue,
        preFlipNameplateRevenue: openingRevenue,
      }
    : policy;
}

/** Cap optional payouts by cash this settlement can actually release. */
export function corporatePayoutCash(input: {
  cash: number;
  income: number;
  alreadySettled: number;
  reservedTax?: number;
}) {
  return Math.max(0, input.cash + input.income - input.alreadySettled - (input.reservedTax ?? 0));
}
