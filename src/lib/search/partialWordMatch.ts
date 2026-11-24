import type { SearchResult } from "@/lib/search/types";

const WORD_SPLIT = /[^\p{L}\p{N}'-]+/u;

/** True when the whole query, or every query word, is a word of the title. */
export function titleHasQueryWord(title: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  const t = title.toLowerCase();
  if (q.length < 2) return true;
  if (t === q) return true;
  const titleWords = t.split(WORD_SPLIT).filter(Boolean);
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => titleWords.some((tw) => tw.startsWith(w)));
}

/**
 * Search matches inside words and inside descriptions ("Margin" finds
 * "Marginal" and pages that only mention margins). Say where the query matched
 * so no hit looks unrelated to what was typed.
 */
export function annotatePartialWordMatch(result: SearchResult, query: string): SearchResult {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return result;
  if (/did you mean|matches only|partial match|matched in/i.test(result.subtitle)) return result;
  const words = result.title.split(WORD_SPLIT).filter(Boolean);
  const lowered = words.map((w) => w.toLowerCase());
  if (lowered.includes(q) || result.title.toLowerCase() === q) return result;
  const partial = words.find((_, i) => lowered[i].includes(q));
  if (partial) {
    return { ...result, subtitle: `${result.subtitle} · partial match: "${partial}"` };
  }
  if (result.title.toLowerCase().includes(q)) return result;
  const inSubtitle = result.subtitle
    .split(WORD_SPLIT)
    .filter(Boolean)
    .find((w) => w.toLowerCase().includes(q));
  if (inSubtitle) {
    return { ...result, subtitle: `${result.subtitle} · matched in description: "${inSubtitle}"` };
  }
  return { ...result, subtitle: `${result.subtitle} · matched in the full text, not the title` };
}
