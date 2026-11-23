/** Edit distance between two lowercase strings, capped so long names stay cheap. */
export function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      row.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > cap) return cap + 1;
    prev = row;
  }
  return prev[b.length];
}

/** One typo for short queries, two from eight letters up. */
function allowedTypos(query: string): number {
  return query.length >= 8 ? 2 : 1;
}

/**
 * Whole-name and per-word fuzzy score: lower is closer, null when the name is
 * not a near miss. A query word may be matched against any word of the name.
 */
export function nearMatchScore(query: string, name: string): number | null {
  const q = query.trim().toLowerCase();
  const n = name.toLowerCase();
  if (q.length < 3) return null;
  const whole = editDistance(q, n, allowedTypos(q));
  if (whole <= allowedTypos(q)) return whole;
  const queryWords = q.split(/\s+/).filter(Boolean);
  const nameWords = n.split(/\s+/).filter(Boolean);
  if (queryWords.length === 0) return null;
  let total = 0;
  for (const qw of queryWords) {
    const tolerance = qw.length < 3 ? 0 : allowedTypos(qw);
    let best = tolerance + 1;
    for (const nw of nameWords) best = Math.min(best, editDistance(qw, nw, tolerance));
    if (best > tolerance) return null;
    total += best;
  }
  return total;
}

/** Closest candidates first, at most `limit`. */
export function nearMatches<T extends { name: string }>(
  query: string,
  candidates: readonly T[],
  limit: number
): T[] {
  return candidates
    .map((candidate) => ({ candidate, score: nearMatchScore(query, candidate.name) }))
    .filter((entry): entry is { candidate: T; score: number } => entry.score !== null)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}
