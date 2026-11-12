import { authConfig } from "@/lib/config/auth";
import type { PasswordCheckOutcome } from "./rules";

/**
 * Client for the central account bridge. Calls authenticate with a cached
 * client-credentials token. Failures collapse to `error` or `timeout`: no
 * response body, credential or address ever leaves this module.
 */

export type BridgeFailure = "error" | "timeout";
export type BridgeResult<T> = { ok: true; data: T } | { ok: false; kind: BridgeFailure };

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

export function resetBridgeTokenCache(): void {
  cachedToken = null;
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

async function fetchToken(deadline: number): Promise<BridgeResult<string>> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) return { ok: true, data: cachedToken.value };

  const tokenUrl = authConfig.accountBridgeTokenUrl();
  const clientId = authConfig.accountBridgeClientId();
  const clientSecret = authConfig.accountBridgeClientSecret();
  if (!tokenUrl || !clientId || !clientSecret) return { ok: false, kind: "error" };

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
    if (!response.ok) return { ok: false, kind: "error" };
    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== "string" || body.access_token.length === 0) {
      return { ok: false, kind: "error" };
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
    return { ok: false, kind: classify(error) };
  }
}

/** One bridge POST. The timeout covers the token fetch and the call together. */
async function post(
  path: string,
  payload: Record<string, unknown>
): Promise<BridgeResult<unknown>> {
  const base = authConfig.accountBridgeUrl();
  if (!base) return { ok: false, kind: "error" };
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
      },
      body: JSON.stringify(payload),
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

const CHECK_RESULTS = new Set(["ok", "wrong", "disabled", "unknown"]);

export async function bridgePasswordCheck(
  ahdUserId: string,
  password: string,
  options: { enforceEnabled: boolean }
): Promise<PasswordCheckOutcome> {
  const result = await post("password-check", {
    ahdUserId,
    password,
    ...(options.enforceEnabled ? { enforceEnabled: true } : {}),
  });
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
