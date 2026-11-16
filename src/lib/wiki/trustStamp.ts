export interface WikiTrustStamp {
  /** ISO date (YYYY-MM-DD) the page was last checked against the game. */
  date: string;
  /** Game version the page was checked against, e.g. "1.18.0". */
  version: string;
}

export interface WikiTrustStatus extends WikiTrustStamp {
  stale: boolean;
}

const STAMP_RE = /Last checked (\d{4}-\d{2}-\d{2}), version (\d+\.\d+(?:\.\d+)?)/g;

/** Reads the last "Last checked <date>, version <x>" line in a page. */
export function parseTrustStamp(content: string): WikiTrustStamp | null {
  let last: RegExpExecArray | null = null;
  for (const match of content.matchAll(STAMP_RE)) last = match;
  if (!last) return null;
  return { date: last[1], version: last[2] };
}

function majorMinor(version: string): [number, number] | null {
  const parts = version.split(".");
  const major = Number(parts[0]);
  const minor = Number(parts[1]);
  if (!Number.isInteger(major) || !Number.isInteger(minor)) return null;
  return [major, minor];
}

/** True when the page was written for an earlier major.minor than the game. */
export function isStampOlderThan(stampVersion: string, currentVersion: string): boolean {
  const stamp = majorMinor(stampVersion);
  const current = majorMinor(currentVersion);
  if (!stamp || !current) return false;
  if (stamp[0] !== current[0]) return stamp[0] < current[0];
  return stamp[1] < current[1];
}

export function getTrustStatus(content: string, currentVersion: string): WikiTrustStatus | null {
  const stamp = parseTrustStamp(content);
  if (!stamp) return null;
  return { ...stamp, stale: isStampOlderThan(stamp.version, currentVersion) };
}

/** "1.18.0" -> "1.18" for plain-language copy. */
export function shortVersion(version: string): string {
  const parts = majorMinor(version);
  return parts ? `${parts[0]}.${parts[1]}` : version;
}
