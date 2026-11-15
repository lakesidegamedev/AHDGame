export interface LinkHistoryRow {
  userId: string;
  subjectHash: string;
  action: "link" | "unlink";
  at: number;
}

/**
 * An Apple ID exempts only the first account that held it from the Discord
 * character gate. Any account that holds it later is not exempt. An unlink
 * row counts as holding, since it proves the account held the subject.
 */
export function appleExemptionHolds(
  userId: string,
  subjectHash: string | null,
  history: readonly LinkHistoryRow[]
): boolean {
  // No hash (no auth secret configured): keep the exemption as it was before link history, never take it away silently.
  if (!subjectHash) return true;
  const rows = history.filter((row) => row.subjectHash === subjectHash);
  if (rows.length === 0) return true;
  const first = rows.reduce((a, b) => (b.at < a.at ? b : a));
  return first.userId === userId;
}

/** Subject hashes an account holds now or held before, per provider. */
export function groupSubjectHashes<T extends { provider: string; subjectHash: string }>(
  rows: readonly T[]
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = out.get(row.provider) ?? new Set<string>();
    set.add(row.subjectHash);
    out.set(row.provider, set);
  }
  return out;
}

/** First provider with a hash present on both sides, or null. */
export function sharedProviderSubject(
  a: Partial<Record<"apple" | "discord" | "google", readonly string[]>> | undefined,
  b: Partial<Record<"apple" | "discord" | "google", readonly string[]>> | undefined
): "apple" | "discord" | "google" | null {
  if (!a || !b) return null;
  for (const provider of ["apple", "discord", "google"] as const) {
    const left = a[provider];
    const right = b[provider];
    if (left && right && left.some((hash) => right.includes(hash))) return provider;
  }
  return null;
}
