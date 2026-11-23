import type { SearchResult } from "@/lib/search/types";

/**
 * Search matches inside words ("Margin" finds "Marginal"). When the query is
 * only part of a longer word in the title, say which word matched so the hit
 * does not look unrelated.
 */
export function annotatePartialWordMatch(result: SearchResult, query: string): SearchResult {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return result;
  const words = result.title.split(/[^\p{L}\p{N}'-]+/u).filter(Boolean);
  const lowered = words.map((w) => w.toLowerCase());
  if (lowered.includes(q) || result.title.toLowerCase() === q) return result;
  const partial = words.find((_, i) => lowered[i].includes(q));
  if (!partial) return result;
  return { ...result, subtitle: `${result.subtitle} · partial match: "${partial}"` };
}
