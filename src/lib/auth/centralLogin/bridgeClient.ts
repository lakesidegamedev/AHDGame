import { authConfig } from "@/lib/config/auth";
import type { PasswordCheckOutcome } from "./rules";
import {
  breakerAdmit,
  breakerOnAdmit,
  breakerOnFailure,
  breakerOnSuccess,
  newBreakerState,
  parseBreakerConfig,
} from "./breaker";
import { recordShadowEvent } from "./shadowEvents";
import { logger } from "@/lib/observability/logger";

/**
 * Client for the central account bridge. Calls authenticate with a cached
 * client-credentials token. Failures collapse to `error` or `timeout`: no
 * response body, credential or address ever leaves this module.
 */

export type BridgeFailure = "error" | "timeout";
/**
 * Why a bridge call failed, for logs and the single retry. `reason` is one of:
 * timeout, connection_refused, connection_reset, dns, network, http, bad_response, not_configured.
 * `node` is the login server that answered (the proxy's X-Lakeside-Node header), when there was an answer.
 */
export interface BridgeFailureDetail {
  reason: string;
  phase: "token" | "call";
  status?: number;
  node?: string;
}
/** `skipped` marks a call the circuit breaker refused without contacting the bridge. */
export type BridgeResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: BridgeFailure; skipped?: true; detail?: BridgeFailureDetail };

export interface BridgeAccount {
  ahdUserId: string;
  username: string;
  email: string;
  emailVerified: boolean;
  passwordHash?: string;
  discordId?: string | null;
  googleId?: string | null;
  appleId?: string | null;
  enabled?: boolean;
}

const DEFAULT_TIMEOUT_MS = 2000;
const TOKEN_EXPIRY_MARGIN_MS = 30_000;
const DEFAULT_TOKEN_LIFETIME_S = 60;

interface CachedToken {
  value: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

const breaker = newBreakerState();

export function resetBridgeBreaker(): void {
  Object.assign(breaker, newBreakerState());
}

/** Read-only: true while the breaker is refusing bridge calls. Never admits a trial. */
export function bridgeBreakerOpen(): boolean {
  return breaker.openUntil !== 0 && Date.now() < breaker.openUntil;
}

/** Clears the cached token and the breaker, so each test starts from a clean client. */
export function resetBridgeTokenCache(): void {
  cachedToken = null;
  resetBridgeBreaker();
}

export function bridgeTimeoutMs(): number {
  const parsed = Number(authConfig.accountBridgeTimeoutMs());
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_TIMEOUT_MS;
}

/**
 * The bridge receives plaintext passwords, so only https or a loopback
 * address is acceptable. Anything else reads as not configured (mode off).
 */
export function isSafeBridgeAddress(raw: string | undefined | null): boolean {
  if (!raw) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host);
}

export function isBridgeConfigured(): boolean {
  return Boolean(
    isSafeBridgeAddress(authConfig.accountBridgeUrl()) &&
    isSafeBridgeAddress(authConfig.accountBridgeTokenUrl()) &&
    authConfig.accountBridgeClientId() &&
    authConfig.accountBridgeClientSecret()
  );
}

function classify(error: unknown): BridgeFailure {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "AbortError" ? "timeout" : "error";
}

/** The network-level reason behind a thrown fetch error (undici puts the code on `cause`). */
export function failureReason(error: unknown): string {
  if (classify(error) === "timeout") return "timeout";
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  const code = typeof cause?.code === "string" ? cause.code : "";
  if (code === "ECONNREFUSED") return "connection_refused";
  if (code === "ECONNRESET" || code === "UND_ERR_SOCKET" || code === "EPIPE")
    return "connection_reset";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "dns";
  if (
    code === "ETIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_HEADERS_TIMEOUT"
  )
    return "timeout";
  return "network";
}

/** Failures worth one immediate retry: the request may never have reached a login server. */
export const RETRYABLE_REASONS = new Set([
  "timeout",
  "connection_refused",
  "connection_reset",
  "dns",
  "network",
]);

function nodeOf(response: Response): string | undefined {
  const node = response.headers.get("x-lakeside-node");
  return node ? node.slice(0, 64) : undefined;
}

async function fetchToken(deadline: number): Promise<BridgeResult<string>> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) return { ok: true, data: cachedToken.value };

  const tokenUrl = authConfig.accountBridgeTokenUrl();
  const clientId = authConfig.accountBridgeClientId();
  const clientSecret = authConfig.accountBridgeClientSecret();
  if (!tokenUrl || !clientId || !clientSecret)
    return { ok: false, kind: "error", detail: { reason: "not_configured", phase: "token" } };

  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(Math.max(1, deadline - now)),
    });
    if (!response.ok)
      return {
        ok: false,
        kind: "error",
        detail: { reason: "http", phase: "token", status: response.status, node: nodeOf(response) },
      };
    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== "string" || body.access_token.length === 0) {
      return {
        ok: false,
        kind: "error",
        detail: { reason: "bad_response", phase: "token", node: nodeOf(response) },
      };
    }
    const lifetimeS =
      typeof body.expires_in === "number" && body.expires_in > 0
        ? body.expires_in
        : DEFAULT_TOKEN_LIFETIME_S;
    cachedToken = {
      value: body.access_token,
      expiresAt: Date.now() + lifetimeS * 1000 - TOKEN_EXPIRY_MARGIN_MS,
    };
    return { ok: true, data: body.access_token };
  } catch (error) {
    return {
      ok: false,
      kind: classify(error),
      detail: { reason: failureReason(error), phase: "token" },
    };
  }
}

/**
 * One bridge POST behind the circuit breaker. After enough consecutive
 * failures calls are skipped for a short window, then a single trial decides
 * whether the breaker closes.
 */
async function post(
  path: string,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<BridgeResult<unknown>> {
  const decision = breakerAdmit(breaker, Date.now());
  if (decision === "skip") {
    void recordShadowEvent({
      userId: typeof payload.ahdUserId === "string" ? payload.ahdUserId : "",
      kind: "bridge",
      local: "n/a",
      central: "error",
      match: false,
      reason: "breaker_open",
      at: new Date(),
    });
    return { ok: false, kind: "error", skipped: true };
  }
  breakerOnAdmit(breaker, decision);
  const result = await rawPost(path, payload, requestId);
  if (result.ok) breakerOnSuccess(breaker);
  else {
    breakerOnFailure(
      breaker,
      Date.now(),
      parseBreakerConfig(
        authConfig.accountBridgeBreakerFailures(),
        authConfig.accountBridgeBreakerOpenMs()
      )
    );
  }
  return result;
}

/** One bridge POST. The timeout covers the token fetch and the call together. */
async function rawPost(
  path: string,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<BridgeResult<unknown>> {
  const base = authConfig.accountBridgeUrl();
  if (!base)
    return { ok: false, kind: "error", detail: { reason: "not_configured", phase: "call" } };
  const deadline = Date.now() + bridgeTimeoutMs();

  const token = await fetchToken(deadline);
  if (!token.ok) return token;

  try {
    const response = await fetch(`${base.replace(/\/+$/, "")}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token.data}`,
        ...(requestId ? { "X-Request-Id": requestId } : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    });
    if (response.status === 401 || response.status === 403) cachedToken = null;
    if (!response.ok)
      return {
        ok: false,
        kind: "error",
        detail: { reason: "http", phase: "call", status: response.status, node: nodeOf(response) },
      };
    return { ok: true, data: await response.json() };
  } catch (error) {
    return {
      ok: false,
      kind: classify(error),
      detail: { reason: failureReason(error), phase: "call" },
    };
  }
}

const CHECK_RESULTS = new Set(["ok", "wrong", "disabled", "unknown"]);

function logCheckFailure(
  requestId: string,
  ahdUserId: string,
  attempt: number,
  result: { kind: BridgeFailure; skipped?: true; detail?: BridgeFailureDetail }
): void {
  logger.warn("central-login", "password check failed", {
    requestId,
    ahdUserId,
    attempt,
    kind: result.kind,
    reason: result.skipped ? "breaker_open" : (result.detail?.reason ?? "unknown"),
    phase: result.detail?.phase ?? null,
    status: result.detail?.status ?? null,
    node: result.detail?.node ?? null,
  });
}

export async function bridgePasswordCheck(
  ahdUserId: string,
  password: string,
  options: { enforceEnabled: boolean }
): Promise<PasswordCheckOutcome> {
  const requestId = globalThis.crypto.randomUUID();
  const payload = {
    ahdUserId,
    password,
    ...(options.enforceEnabled ? { enforceEnabled: true } : {}),
  };
  let result = await post("password-check", payload, requestId);
  // One immediate retry when the request may never have reached a login server (timeout or a
  // connection-level failure). Never on an answer: a wrong password, an HTTP error or a breaker skip.
  if (!result.ok) {
    logCheckFailure(requestId, ahdUserId, 1, result);
    if (!result.skipped && result.detail && RETRYABLE_REASONS.has(result.detail.reason)) {
      result = await post("password-check", payload, requestId);
      if (!result.ok) logCheckFailure(requestId, ahdUserId, 2, result);
    }
  }
  if (!result.ok) return result.kind;
  const value = (result.data as { result?: unknown } | null)?.result;
  return typeof value === "string" && CHECK_RESULTS.has(value)
    ? (value as PasswordCheckOutcome)
    : "error";
}

export async function bridgePasswordSet(
  ahdUserId: string,
  password: string
): Promise<BridgeResult<null>> {
  const result = await post("password-set", { ahdUserId, password });
  if (!result.ok) return result;
  return (result.data as { result?: unknown } | null)?.result === "ok"
    ? { ok: true, data: null }
    : { ok: false, kind: "error" };
}

export async function bridgeAccountUpsert(account: BridgeAccount): Promise<BridgeResult<null>> {
  const result = await post("account-upsert", { ...account });
  if (!result.ok) return result;
  const value = (result.data as { result?: unknown } | null)?.result;
  return value === "created" || value === "updated"
    ? { ok: true, data: null }
    : { ok: false, kind: "error" };
}

export async function bridgeAccountDelete(ahdUserId: string): Promise<BridgeResult<null>> {
  const result = await post("account-delete", { ahdUserId });
  if (!result.ok) return result;
  return { ok: true, data: null };
}

/** A single-use code that lets the central login page sign this user in. */
export async function bridgeLoginTicket(ahdUserId: string): Promise<BridgeResult<string>> {
  const result = await post("login-ticket", { ahdUserId });
  if (!result.ok) return result;
  const ticket = (result.data as { ticket?: unknown } | null)?.ticket;
  return typeof ticket === "string" && ticket.length > 0
    ? { ok: true, data: ticket }
    : { ok: false, kind: "error" };
}

/** The account-changes feed: one GET with the cached client-credentials token. */
export async function bridgeAccountChanges(
  after: number,
  limit: number
): Promise<BridgeResult<unknown>> {
  const base = authConfig.accountBridgeUrl();
  if (!base) return { ok: false, kind: "error" };
  const deadline = Date.now() + Math.max(bridgeTimeoutMs(), 5000);

  const token = await fetchToken(deadline);
  if (!token.ok) return token;

  try {
    const query = new URLSearchParams({ after: String(after), limit: String(limit) });
    const response = await fetch(`${base.replace(/\/+$/, "")}/account-changes?${query}`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${token.data}` },
      cache: "no-store",
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    });
    if (response.status === 401 || response.status === 403) cachedToken = null;
    if (!response.ok) return { ok: false, kind: "error" };
    return { ok: true, data: await response.json() };
  } catch (error) {
    return { ok: false, kind: classify(error) };
  }
}
