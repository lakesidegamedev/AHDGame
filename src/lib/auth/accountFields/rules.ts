/**
 * Pure rules for following the central Lakeside account for email and
 * password. No I/O: the consumer and the routes call these.
 */

export type AccountFieldsMode = "off" | "freeze" | "central";

export type AccountFieldKind = "email" | "password" | "reset";

export const ACCOUNT_URL = "https://lakesidegames.net/account";

export const FREEZE_MESSAGE =
  "Account details are moving to your Lakeside account. This is back in a few minutes.";

export const SIGN_IN_UNAVAILABLE_MESSAGE =
  "Sign-in is temporarily unavailable. Please try again in a few minutes.";

export const PASSWORD_EVERYWHERE_NOTE =
  "Your password is the same in every Lakeside game. When you change it at your Lakeside account, it changes here too.";

const CENTRAL_ACTION: Record<AccountFieldKind, string> = {
  email: "Change your email at your Lakeside account",
  password: "Change your password at your Lakeside account",
  reset: "Reset your password at your Lakeside account",
};

/** Anything other than the two switch-on values is off, so a typo never freezes accounts. */
export function parseAccountFieldsMode(raw: string | undefined | null): AccountFieldsMode {
  const value = raw?.trim().toLowerCase();
  if (value === "freeze" || value === "central") return value;
  return "off";
}

export function centralActionLabel(kind: AccountFieldKind): string {
  return CENTRAL_ACTION[kind];
}

/** The plain-words message an API or screen shows for a non-off mode. */
export function accountFieldsMessage(
  mode: Exclude<AccountFieldsMode, "off">,
  kind: AccountFieldKind
): string {
  return mode === "freeze" ? FREEZE_MESSAGE : `${CENTRAL_ACTION[kind]}: ${ACCOUNT_URL}`;
}

/** Same normalisation as registration: trimmed and lowercased. */
export function normalizeFeedEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.length > 0 && email.length <= 320 && /^[^\s@]+@[^\s@]+$/.test(email) ? email : null;
}

export interface AccountChange {
  seq: number;
  ahdUserId: string;
  kind: string;
  email?: string;
  at: number;
}

export interface AccountChangesPage {
  changes: AccountChange[];
  next: number;
}

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** Validates a feed page. Malformed entries are dropped, a malformed page is null. */
export function parseAccountChangesPage(raw: unknown): AccountChangesPage | null {
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw as { changes?: unknown; next?: unknown };
  if (!Array.isArray(body.changes)) return null;
  if (typeof body.next !== "number" || !Number.isSafeInteger(body.next) || body.next < 0) {
    return null;
  }
  const changes: AccountChange[] = [];
  for (const entry of body.changes) {
    if (typeof entry !== "object" || entry === null) continue;
    const c = entry as Record<string, unknown>;
    if (typeof c.seq !== "number" || !Number.isSafeInteger(c.seq) || c.seq < 0) continue;
    if (typeof c.ahdUserId !== "string" || !OBJECT_ID.test(c.ahdUserId)) continue;
    if (typeof c.kind !== "string") continue;
    changes.push({
      seq: c.seq,
      ahdUserId: c.ahdUserId.toLowerCase(),
      kind: c.kind,
      ...(typeof c.email === "string" ? { email: c.email } : {}),
      at: typeof c.at === "number" && Number.isFinite(c.at) ? c.at : 0,
    });
  }
  changes.sort((a, b) => a.seq - b.seq);
  return { changes, next: body.next };
}

export type SupersededLoginDecision = "accept" | "reject" | "unavailable";

/**
 * An account whose password moved to the central account has no local copy to
 * fall back on. Only a definite central answer decides; an outage or an
 * unknown account refuses sign-in instead of checking a stale hash.
 */
export function decideSupersededLogin(
  outcome: "ok" | "wrong" | "disabled" | "unknown" | "error" | "timeout"
): SupersededLoginDecision {
  if (outcome === "ok") return "accept";
  if (outcome === "wrong" || outcome === "disabled") return "reject";
  return "unavailable";
}
