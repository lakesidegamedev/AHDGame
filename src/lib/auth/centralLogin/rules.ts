export type CentralLoginMode = "off" | "shadow" | "central";

export type PasswordCheckOutcome = "ok" | "wrong" | "disabled" | "unknown" | "error" | "timeout";

export type LocalPasswordResult = "ok" | "wrong";

export type CentralLoginDecision =
  { action: "accept" } | { action: "reject" } | { action: "fallback-local" };

/** Anything other than the two switch-on values is off, so a typo never enables the bridge. */
export function parseCentralLoginMode(raw: string | undefined): CentralLoginMode {
  const value = raw?.trim().toLowerCase();
  if (value === "shadow" || value === "central") return value;
  return "off";
}

/**
 * Central mode: only an infrastructure failure may fall back to the local
 * check. A definite answer from the central system, including wrong, disabled
 * and unknown, is final.
 */
export function decideCentralLogin(outcome: PasswordCheckOutcome): CentralLoginDecision {
  if (outcome === "ok") return { action: "accept" };
  if (outcome === "error" || outcome === "timeout") return { action: "fallback-local" };
  return { action: "reject" };
}

/** Whether the central answer agrees with the local decision. Failures never match. */
export function shadowMatches(local: LocalPasswordResult, central: PasswordCheckOutcome): boolean {
  if (local === "ok") return central === "ok";
  return central === "wrong" || central === "disabled";
}
