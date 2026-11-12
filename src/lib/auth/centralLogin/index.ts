import type { ObjectId } from "mongodb";
import { authConfig } from "@/lib/config/auth";
import {
  bridgeAccountDelete,
  bridgeAccountUpsert,
  bridgePasswordCheck,
  bridgePasswordSet,
  isBridgeConfigured,
  type BridgeAccount,
  type BridgeResult,
} from "./bridgeClient";
import {
  parseCentralLoginMode,
  type CentralLoginMode,
  type LocalPasswordResult,
  type PasswordCheckOutcome,
} from "./rules";
import {
  passwordShadowEvent,
  recordShadowEvent,
  type ShadowEventKind,
  type ShadowEventReason,
} from "./shadowEvents";

export { decideCentralLogin } from "./rules";
export type { CentralLoginMode, PasswordCheckOutcome } from "./rules";

/** The one place the switch is read. */
export function getCentralLoginMode(): CentralLoginMode {
  const mode = parseCentralLoginMode(authConfig.centralLoginMode());
  // A switched-on mode without bridge config behaves as off, never half-on.
  return mode !== "off" && !isBridgeConfigured() ? "off" : mode;
}

export const CENTRAL_WRITE_UNAVAILABLE_MESSAGE =
  "Account services are busy right now. Please try again shortly.";

/** bcrypt cannot hold a password of this many UTF-8 bytes or more, so the central copy cannot either. */
export const CENTRAL_PASSWORD_MAX_BYTES = 72;

export const CENTRAL_PASSWORD_TOO_LONG_MESSAGE = "Use a password under 72 bytes";

export function isLongPasswordForCentral(password: string): boolean {
  return Buffer.byteLength(password, "utf8") >= CENTRAL_PASSWORD_MAX_BYTES;
}

/** New passwords are refused when too long, but only while the central system is in play. */
export function newPasswordTooLongForCentral(password: string): boolean {
  return getCentralLoginMode() !== "off" && isLongPasswordForCentral(password);
}

/** Shadow and central modes: a login whose password cannot be checked centrally. */
export function recordLongPasswordLogin(userId: string, local: LocalPasswordResult): void {
  if (getCentralLoginMode() === "off") return;
  void recordShadowEvent({
    userId,
    kind: "password",
    local,
    central: "n/a",
    match: false,
    reason: "long_password",
    at: new Date(),
  });
}

export type BridgeWriteOp =
  | { op: "password-set"; ahdUserId: string; password: string }
  | { op: "account-upsert"; account: BridgeAccount }
  | { op: "account-delete"; ahdUserId: string };

function opUserId(write: BridgeWriteOp): string {
  return write.op === "account-upsert" ? write.account.ahdUserId : write.ahdUserId;
}

function runWrite(write: BridgeWriteOp): Promise<BridgeResult<null>> {
  switch (write.op) {
    case "password-set":
      return bridgePasswordSet(write.ahdUserId, write.password);
    case "account-upsert":
      return bridgeAccountUpsert(write.account);
    case "account-delete":
      return bridgeAccountDelete(write.ahdUserId);
  }
}

async function runAndRecordWrite(
  write: BridgeWriteOp,
  reason?: ShadowEventReason
): Promise<boolean> {
  const result = await runWrite(write);
  await recordShadowEvent({
    userId: opUserId(write),
    kind: "write",
    op: write.op,
    local: "n/a",
    central: result.ok ? "ok" : result.kind,
    match: result.ok,
    ...(reason ? { reason } : {}),
    at: new Date(),
  });
  return result.ok;
}

/**
 * Central mode: the credential write reaches the central system before the
 * local copy. Returns false when the caller must refuse the write. Any other
 * mode returns true without a bridge call.
 */
export async function centralWriteFirst(write: BridgeWriteOp): Promise<boolean> {
  if (getCentralLoginMode() !== "central") return true;
  return runAndRecordWrite(write);
}

/**
 * Central mode: the local write failed after the central write landed, so put
 * the central account back to the previous local state. `password` also
 * restores the previous hash; an account that had none cannot be restored.
 * Best effort, recorded, never throws.
 */
export async function centralRestoreAccount(
  previous: AccountSource & { password?: unknown },
  options: { password?: boolean; overrides?: Partial<BridgeAccount> } = {}
): Promise<void> {
  if (getCentralLoginMode() !== "central") return;
  const hash =
    options.password && typeof previous.password === "string" && previous.password
      ? previous.password
      : undefined;
  if (options.password && !hash) {
    await recordShadowEvent({
      userId: previous._id.toHexString(),
      kind: "write",
      op: "account-upsert",
      local: "n/a",
      central: "n/a",
      match: false,
      reason: "restore_unavailable",
      at: new Date(),
    });
    return;
  }
  const account = bridgeAccountFromUser(previous, {
    ...(hash ? { passwordHash: hash } : {}),
    ...options.overrides,
  });
  await runAndRecordWrite({ op: "account-upsert", account }, "restore").catch(() => {});
}

/** Central mode: undo a central create whose local insert failed. Best effort. */
export async function centralRollbackCreate(ahdUserId: string): Promise<void> {
  if (getCentralLoginMode() !== "central") return;
  await bridgeAccountDelete(ahdUserId).catch(() => {});
}

/** Shadow mode: mirror a committed local write, best effort and never awaited by the caller. */
export function shadowMirrorWrite(write: BridgeWriteOp): void {
  if (getCentralLoginMode() !== "shadow") return;
  void runAndRecordWrite(write).catch(() => {});
}

/** Shadow mode: compare a settled local password decision with the central answer. */
export function shadowCheckPassword(
  userId: string,
  password: string,
  local: LocalPasswordResult
): void {
  if (getCentralLoginMode() !== "shadow") return;
  void (async () => {
    const central = await bridgePasswordCheck(userId, password, { enforceEnabled: false });
    await recordShadowEvent(passwordShadowEvent(userId, local, central));
  })().catch(() => {});
}

/** Central mode: the authoritative password answer. */
export function centralCheckPassword(
  userId: string,
  password: string
): Promise<PasswordCheckOutcome> {
  return bridgePasswordCheck(userId, password, { enforceEnabled: true });
}

/** Central mode: note that a failed central check was served from the local copy. */
export function recordLoginFallback(
  userId: string,
  local: LocalPasswordResult,
  central: PasswordCheckOutcome
): void {
  void recordShadowEvent(passwordShadowEvent(userId, local, central, true));
}

/** Shadow mode: provider logins are recorded without a central comparison. */
export function shadowRecordProviderLogin(
  userId: string,
  kind: Extract<ShadowEventKind, "apple" | "google" | "discord">
): void {
  if (getCentralLoginMode() !== "shadow") return;
  void recordShadowEvent({
    userId,
    kind,
    local: "ok",
    central: "n/a",
    match: false,
    at: new Date(),
  });
}

interface AccountSource {
  _id: ObjectId;
  username?: unknown;
  email?: unknown;
  emailVerifiedAt?: unknown;
}

/**
 * Account payload for `account-upsert`. An absent field means unchanged
 * centrally and an explicit null clears it, so provider ids are sent only when
 * the caller names them in `overrides`.
 */
export function bridgeAccountFromUser(
  user: AccountSource,
  overrides: Partial<BridgeAccount> = {}
): BridgeAccount {
  return {
    ahdUserId: user._id.toHexString(),
    username: typeof user.username === "string" ? user.username : "",
    email: typeof user.email === "string" ? user.email : "",
    emailVerified: user.emailVerifiedAt != null,
    ...overrides,
  };
}
