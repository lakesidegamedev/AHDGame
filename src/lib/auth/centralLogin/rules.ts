export type CentralLoginMode = "off" | "shadow" | "central";

export type PasswordCheckOutcome = "ok" | "wrong" | "disabled" | "unknown" | "error" | "timeout";

export type LocalPasswordResult = "ok" | "wrong";

export type CentralLoginDecision =
  | { action: "accept" }
  | { action: "reject" }
  | { action: "fallback-local" }
  | { action: "heal-local" };

/** Anything other than the two switch-on values is off, so a typo never enables the bridge. */
export function parseCentralLoginMode(raw: string | undefined): CentralLoginMode {
  const value = raw?.trim().toLowerCase();
  if (value === "shadow" || value === "central") return value;
  return "off";
}

/** The listed ids that are well formed, lowercased. Anything else is ignored. */
export function parseCentralLoginTestUsers(raw: string | undefined): Set<string> {
  const ids = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const id = part.trim().toLowerCase();
    if (/^[0-9a-f]{24}$/.test(id)) ids.add(id);
  }
  return ids;
}

/** Only a shadow run can be raised to central, and only for a listed user. */
export function modeForUser(
  globalMode: CentralLoginMode,
  userId: string,
  testUsers: ReadonlySet<string>
): CentralLoginMode {
  if (globalMode === "shadow" && testUsers.has(userId.trim().toLowerCase())) return "central";
  return globalMode;
}

/**
 * Central mode: an infrastructure failure falls back to the local check. An
 * account the central system does not know (an import gap or a failed mirror)
 * also checks locally and, on success, is recreated centrally so it heals;
 * that is recorded separately from outage fallbacks. Wrong and disabled are
 * final and never retried locally.
 */
export function decideCentralLogin(outcome: PasswordCheckOutcome): CentralLoginDecision {
  if (outcome === "ok") return { action: "accept" };
  if (outcome === "error" || outcome === "timeout") return { action: "fallback-local" };
  if (outcome === "unknown") return { action: "heal-local" };
  return { action: "reject" };
}

/** Whether the central answer agrees with the local decision. Failures never match. */
export function shadowMatches(local: LocalPasswordResult, central: PasswordCheckOutcome): boolean {
  if (local === "ok") return central === "ok";
  return central === "wrong" || central === "disabled";
}
