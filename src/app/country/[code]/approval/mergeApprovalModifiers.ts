import type { ActiveModifier } from "@/lib/utils/approvalModifiers";

/**
 * Combine the two sources of national approval modifiers this page can read.
 *
 * The metrics endpoint recomputes metric conditions live and is preferred for
 * those. It does NOT carry the national providers (head-of-government address
 * bump, international joint statements, war block) because those read conflicts,
 * personnel and org state, which is turn-phase work rather than page-render
 * work. They arrive through the approval endpoint alone; preferring one source
 * outright silently dropped all of them.
 *
 * Only NON-metric modifiers are appended. Both endpoints derive metric
 * conditions from the same evaluator, so the metrics endpoint's copy is taken
 * wholesale to avoid mixing a stale condition beside freshly recomputed ones.
 * The id check guards against listing the same effect twice.
 */
export function mergeApprovalModifiers(
  fromMetrics: ActiveModifier[] | undefined,
  fromApproval: ActiveModifier[] | undefined
): ActiveModifier[] {
  const stored = fromApproval ?? [];
  if (!fromMetrics) return stored;

  const seen = new Set(fromMetrics.map((modifier) => modifier.id));
  const national = stored.filter(
    (modifier) => modifier.source !== "metric" && !seen.has(modifier.id)
  );
  return [...fromMetrics, ...national];
}
