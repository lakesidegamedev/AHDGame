/** Keeps the first result for each distinct title and subtitle pair. */
export function dedupeByLabel<T extends { title: string; subtitle?: string }>(results: T[]): T[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.title}\u0000${r.subtitle ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
