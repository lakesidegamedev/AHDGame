/**
 * Spending areas pulled out of a national budget's "Other" line.
 *
 * Laws book into a handful of stored categories, and every law without a
 * dedicated category (environment, justice and public safety, housing) lands in
 * "other". The areas here are read from the law's own administering portfolio,
 * the same one the department accounts fund, and each area is the sum of the
 * real annual costs of its laws. Nothing is split by a made-up ratio.
 *
 * Pure rules: plain data in, plain data out.
 */

export type SpendingAreaId = "environment" | "justice" | "housing";

export const SPENDING_AREA_LABELS: Record<SpendingAreaId, { label: string; description: string }> =
  {
    environment: {
      label: "Environment and energy",
      description:
        "Environment, water, parks, energy and resources laws, run by the environment and interior departments. The game has no separate water budget, so water laws are counted on this line.",
    },
    justice: {
      label: "Justice and public safety",
      description:
        "Courts, policing, corrections and legal aid laws, run by the justice departments.",
    },
    housing: {
      label: "Housing",
      description:
        "Public housing, home ownership and urban renewal laws, run by the housing department.",
    },
  };

const HOUSING_TYPE_ID =
  /housing|homeownership|urbanrenewal|newcommunities|\.infrastructure\.ownership\./i;

/**
 * The spending area a law belongs to, or undefined when it stays in Other.
 * `portfolioId` is the law type's administering portfolio when stored; the policy
 * domain is the fallback for countries whose types carry no administration yet.
 */
export function spendingAreaForLaw(input: {
  legislationTypeId?: string | null;
  policyDomain?: string | null;
  portfolioId?: string | null;
}): SpendingAreaId | undefined {
  if (input.portfolioId === "housing" || HOUSING_TYPE_ID.test(input.legislationTypeId ?? "")) {
    return "housing";
  }
  const portfolio = input.portfolioId;
  if (portfolio === "environment_energy") return "environment";
  if (portfolio === "justice" && input.policyDomain !== "governance") return "justice";
  if (!portfolio) {
    if (input.policyDomain === "environment") return "environment";
    if (input.policyDomain === "publicSafety" || input.policyDomain === "law_justice") {
      return "justice";
    }
  }
  return undefined;
}

export interface AreaLaw<T> {
  law: T;
  area: SpendingAreaId | undefined;
  /** Live annual cost; null when unpriced. */
  amount: number | null | undefined;
}

export interface SpendingAreaLine<T> {
  id: SpendingAreaId;
  label: string;
  description: string;
  amount: number;
  laws: T[];
}

/**
 * Split the Other line into area lines and what is left.
 *
 * The lines plus the remainder always equal `otherTotal`. If the live law costs
 * overshoot the stored line (the page prices laws live, the line was booked at
 * the last refresh), the area amounts are scaled down together so no area can
 * claim money the line does not hold.
 */
export function splitOtherByArea<T>(
  otherTotal: number,
  items: readonly AreaLaw<T>[]
): { lines: SpendingAreaLine<T>[]; remainderTotal: number; remainderLaws: T[] } {
  const none = { lines: [], remainderTotal: otherTotal, remainderLaws: items.map((i) => i.law) };
  if (!(otherTotal > 0)) return none;
  const priced = items.filter(
    (i) => i.area && typeof i.amount === "number" && Number.isFinite(i.amount) && i.amount > 0
  );
  if (priced.length === 0) return none;
  const raw = priced.reduce((sum, i) => sum + (i.amount as number), 0);
  const scale = raw > otherTotal ? otherTotal / raw : 1;

  const byArea = new Map<SpendingAreaId, SpendingAreaLine<T>>();
  for (const item of priced) {
    const id = item.area as SpendingAreaId;
    const line = byArea.get(id) ?? { id, ...SPENDING_AREA_LABELS[id], amount: 0, laws: [] };
    line.amount += (item.amount as number) * scale;
    line.laws.push(item.law);
    byArea.set(id, line);
  }
  const lines = [...byArea.values()].sort((a, b) => b.amount - a.amount);
  const taken = new Set(priced.map((i) => i.law));
  return {
    lines,
    remainderTotal: Math.max(0, otherTotal - lines.reduce((sum, l) => sum + l.amount, 0)),
    remainderLaws: items.filter((i) => !taken.has(i.law)).map((i) => i.law),
  };
}

export interface CategoryHousingLaw<T> {
  law: T;
  /** Stored spending category the law books into. */
  category: string;
  /** Live annual cost; null when unpriced. */
  amount: number | null | undefined;
}

/**
 * Housing laws that book into a stored category other than "other" (public
 * housing is booked as infrastructure in some countries). Each category gives up
 * no more than its own total, scaled down together when live prices overshoot.
 */
export function liftHousingFromCategories<T>(
  categoryTotals: Readonly<Record<string, number>>,
  items: readonly CategoryHousingLaw<T>[]
): { amountByCategory: Record<string, number>; laws: T[]; total: number } {
  const amountByCategory: Record<string, number> = {};
  const laws: T[] = [];
  const raw = new Map<string, number>();
  const priced = items.filter(
    (i) => typeof i.amount === "number" && Number.isFinite(i.amount) && i.amount > 0
  );
  for (const item of priced) {
    raw.set(item.category, (raw.get(item.category) ?? 0) + (item.amount as number));
  }
  for (const [category, sum] of raw) {
    const total = categoryTotals[category] ?? 0;
    if (!(total > 0)) continue;
    const scale = sum > total ? total / sum : 1;
    for (const item of priced) {
      if (item.category !== category) continue;
      amountByCategory[category] =
        (amountByCategory[category] ?? 0) + (item.amount as number) * scale;
      laws.push(item.law);
    }
  }
  return {
    amountByCategory,
    laws,
    total: Object.values(amountByCategory).reduce((sum, v) => sum + v, 0),
  };
}
