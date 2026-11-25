/**
 * New household income: a small amount of new money paid to households each
 * turn so a closed economy can grow. Each country's households get a share of
 * their own income this turn (wages plus budget transfers), set by the
 * country's real GDP growth: twice the annual growth rate, at most 3%, and
 * nothing while the economy shrinks. Every wallet in a country gets the same
 * share of its income, so the money favours no company, sector, good or
 * player: households spend it by the same rules as the rest of their money.
 * Pure.
 */

/** Share of household income paid per percentage point of annual real GDP growth... */
export const NEW_HOUSEHOLD_INCOME_PER_GROWTH_POINT = 0.02;
/** ...never more than this share of household income in a turn. */
export const NEW_HOUSEHOLD_INCOME_MAX_SHARE = 0.03;

/** gameConfig.newHouseholdIncomeStage >= 1 (absent = 1, on). */
export function newHouseholdIncomeOn(env: { newHouseholdIncomeStage?: number }): boolean {
  return (env.newHouseholdIncomeStage ?? 1) >= 1;
}

/** Share of household income paid as new income, from annual real GDP growth in percent. */
export function newHouseholdIncomeShare(realGdpGrowthPct: number | null | undefined): number {
  if (typeof realGdpGrowthPct !== "number" || !Number.isFinite(realGdpGrowthPct)) return 0;
  return Math.min(
    NEW_HOUSEHOLD_INCOME_MAX_SHARE,
    Math.max(0, realGdpGrowthPct * NEW_HOUSEHOLD_INCOME_PER_GROWTH_POINT)
  );
}

export interface NewHouseholdIncomeRow {
  walletId: string;
  countryId: string;
  /** Anchor currency, per turn. */
  amount: number;
  /** Share of the wallet's income it is. */
  share: number;
}

/**
 * Each household wallet's new income this turn: its own income times its
 * country's share. Wallets with no income, and countries with no growth or no
 * growth figure, get nothing.
 */
export function newHouseholdIncome(input: {
  wallets: readonly { accountId: string; countryId: string }[];
  /** Wages and transfers each wallet receives this turn, anchor currency. */
  incomeByWallet: ReadonlyMap<string, number>;
  /** Annual real GDP growth in percent, by country. */
  realGdpGrowthByCountry: ReadonlyMap<string, number>;
}): NewHouseholdIncomeRow[] {
  const out: NewHouseholdIncomeRow[] = [];
  for (const w of [...input.wallets].sort((a, b) => (a.accountId < b.accountId ? -1 : 1))) {
    const share = newHouseholdIncomeShare(input.realGdpGrowthByCountry.get(w.countryId));
    const income = input.incomeByWallet.get(w.accountId) ?? 0;
    const amount = Number.isFinite(income) && income > 0 ? income * share : 0;
    if (amount > 0) out.push({ walletId: w.accountId, countryId: w.countryId, amount, share });
  }
  return out;
}

/** Totals by country, for the turn record and screens. */
export function newHouseholdIncomeByCountry(
  rows: readonly NewHouseholdIncomeRow[]
): Record<string, { amount: number; share: number }> {
  const out: Record<string, { amount: number; share: number }> = {};
  for (const r of rows) {
    const c = (out[r.countryId] ??= { amount: 0, share: r.share });
    c.amount += r.amount;
  }
  return out;
}

/** What a turn record keeps: anchor amounts and the share paid, by country, and the total. */
export function newHouseholdIncomeRecord(rows: readonly NewHouseholdIncomeRow[]): {
  totalAnchor: number;
  byCountry: Record<string, { amountAnchor: number; share: number }>;
} {
  const byCountry: Record<string, { amountAnchor: number; share: number }> = {};
  for (const [countryId, v] of Object.entries(newHouseholdIncomeByCountry(rows)))
    byCountry[countryId] = { amountAnchor: v.amount, share: v.share };
  return { totalAnchor: rows.reduce((sum, r) => sum + r.amount, 0), byCountry };
}

/**
 * The money-created audit: what the turn planned to pay as new household
 * income against what the money-move ledger minted for it, both anchor.
 * Null when they agree within rounding; otherwise the warning to raise.
 */
export function newHouseholdIncomeAuditWarning(
  plannedAnchor: number,
  mintedAnchor: number
): string | null {
  const gap = mintedAnchor - plannedAnchor;
  if (Math.abs(gap) <= 1e-6 * Math.max(1, Math.abs(plannedAnchor))) return null;
  return `New household income audit: planned ${plannedAnchor.toFixed(2)} but the ledger minted ${mintedAnchor.toFixed(2)} (anchor)`;
}
