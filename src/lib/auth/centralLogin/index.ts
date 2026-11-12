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
import { passwordShadowEvent, recordShadowEvent, type ShadowEventKind } from "./shadowEvents";

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

async function runAndRecordWrite(write: BridgeWriteOp): Promise<boolean> {
  const result = await runWrite(write);
  await recordShadowEvent({
    userId: opUserId(write),
    kind: "write",
    op: write.op,
    local: "n/a",
    central: result.ok ? "ok" : result.kind,
    match: result.ok,
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
  discordId?: unknown;
  googleId?: unknown;
  appleId?: unknown;
}

function idOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Account payload for `account-upsert`, built from a local user document. */
export function bridgeAccountFromUser(
  user: AccountSource,
  overrides: Partial<BridgeAccount> = {}
): BridgeAccount {
  return {
    ahdUserId: user._id.toHexString(),
    username: typeof user.username === "string" ? user.username : "",
    email: typeof user.email === "string" ? user.email : "",
    emailVerified: user.emailVerifiedAt != null,
    discordId: idOrNull(user.discordId),
    googleId: idOrNull(user.googleId),
    appleId: idOrNull(user.appleId),
    ...overrides,
  };
}
