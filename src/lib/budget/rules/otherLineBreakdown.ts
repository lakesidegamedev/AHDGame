/**
 * What sits inside a national budget's "Other" lines (suggestion 405).
 *
 * Both lines are sums the budget never itemises when it stores them:
 *
 * - Other spending is every enacted law charged to "other" (a law with no
 *   category lands there too, see spending.ts) plus the general spending the
 *   budget books without a law, a share of GDP or a seeded baseline.
 * - Other revenue is fees, fines and other non-tax receipts, a share of GDP,
 *   plus income from state-owned companies that report into "other" (see
 *   revenue.ts and publicEnterpriseRevenue.ts). Only the sum is stored.
 *
 * The parts are derived from what the budget page already holds, so they always
 * add up to the line they explain. Pure: plain numbers in, plain data out.
 */

export interface OtherLinePart {
  label: string;
  amount: number;
  note?: string;
}

/** A remainder smaller than this share of the line is rounding, not a part. */
const RESIDUAL_FLOOR_SHARE = 0.001;

function isPositive(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** The spending category a law books into; an uncategorised law books into "other". */
export function lawSpendingCategory(budgetCategory: string | null | undefined): string {
  return budgetCategory || "other";
}

/**
 * Parts of the Other spending line: each law charged to it, largest first, then
 * the remainder the budget books without a law.
 */
export function otherSpendingParts(input: {
  total: number;
  laws: readonly { title: string; amount: number | null | undefined }[];
}): OtherLinePart[] {
  if (!isPositive(input.total)) return [];
  // A law that saves money books a negative cost into the line, and a list of
  // positive rows plus a remainder could not show that honestly. Say nothing.
  if (input.laws.some((l) => typeof l.amount === "number" && l.amount < 0)) return [];
  const laws = input.laws
    .filter((l): l is { title: string; amount: number } => isPositive(l.amount))
    .map((l) => ({ label: l.title, amount: l.amount }))
    .sort((a, b) => b.amount - a.amount);
  const lawTotal = laws.reduce((s, l) => s + l.amount, 0);
  const remainder = input.total - lawTotal;
  // The line was booked at the last budget refresh and the page prices laws
  // live, so after the economy moves the laws can sum past the line. Rows that
  // overshoot the line they explain are wrong, so itemise nothing then.
  if (remainder < -input.total * RESIDUAL_FLOOR_SHARE) return [];
  const parts: OtherLinePart[] = [...laws];
  if (remainder > input.total * RESIDUAL_FLOOR_SHARE)
    parts.push({
      label: "General spending not tied to a law",
      amount: remainder,
      note: "Running costs of government the budget books without an enacted law.",
    });
  return parts;
}

/**
 * The Other revenue line as one part. The budget stores it as a single sum of
 * two sources, and splitting it on the page would mean recomputing the GDP-share
 * half against a GDP that may have moved since the turn computed it, so the
 * line is named for both sources instead of guessed apart.
 */
export function otherRevenueParts(input: { total: number }): OtherLinePart[] {
  if (!isPositive(input.total)) return [];
  return [
    {
      label: "Fees, fines, asset income and state company profits",
      amount: input.total,
      note: "Receipts that are not a tax, such as charges, fines and asset income, modelled as one amount that grows with the economy, plus profit from state-owned companies that do not pay into a named revenue line.",
    },
  ];
}
