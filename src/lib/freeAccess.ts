import { authConfig } from "@/lib/config/auth";

const DEFAULT_ACCOUNTS_URL = "https://lakesidegames.net";
const CACHE_MS = 60_000;
const TIMEOUT_MS = 1500;
/** A grant that exists only because free access is on lapses within this window. */
export const FREE_ACCESS_GRANT_MS = 60 * 60 * 1000;

let cache: { on: boolean; until: number } | null = null;

/** Only a literal boolean `on` counts; anything else keeps real ownership in force. */
export function parseFreeAccessBody(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  return (body as { on?: unknown }).on === true;
}

/** Expiry for an entitlement: free-access-only grants are capped, real ones keep the long grace. */
export function entitlementExpiryMs(input: {
  nowMs: number;
  graceMs: number;
  freeAccessOnly: boolean;
}): number {
  const grace = input.nowMs + input.graceMs;
  return input.freeAccessOnly ? Math.min(grace, input.nowMs + FREE_ACCESS_GRANT_MS) : grace;
}

export function resetFreeAccessCache(): void {
  cache = null;
}

/** Whether the account service says the game is free to enter. Fails closed. */
export async function isFreeAccessOn(): Promise<boolean> {
  const now = Date.now();
  if (cache && now < cache.until) return cache.on;
  let on = false;
  try {
    const base = (authConfig.accountsUrl()?.trim() || DEFAULT_ACCOUNTS_URL).replace(/\/+$/, "");
    const res = await fetch(`${base}/account/api/free-access`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    on = res.status === 200 && parseFreeAccessBody(await res.json());
  } catch {
    on = false;
  }
  cache = { on, until: now + CACHE_MS };
  return on;
}
