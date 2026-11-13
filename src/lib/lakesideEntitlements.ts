import { authConfig } from "@/lib/config/auth";

const DEFAULT_ACCOUNTS_URL = "https://lakesidegames.net";
const CACHE_MS = 60_000;
const TIMEOUT_MS = 1500;
const MAX_CACHE_ENTRIES = 5000;

const cache = new Map<string, { paid: ReadonlySet<string>; until: number }>();

export function resetLakesideEntitlementCache(): void {
  cache.clear();
}

/** Product ids the account service lists as paid. Anything unreadable yields none. */
export function parsePaidProductIds(body: unknown): Set<string> {
  const paid = new Set<string>();
  if (typeof body !== "object" || body === null) return paid;
  const purchases = (body as { purchases?: unknown }).purchases;
  if (!Array.isArray(purchases)) return paid;
  for (const item of purchases) {
    if (typeof item !== "object" || item === null) continue;
    const { productId, status } = item as { productId?: unknown; status?: unknown };
    if (typeof productId === "string" && status === "paid") paid.add(productId);
  }
  return paid;
}

/**
 * Whether the account service lists a paid entitlement for this product (a purchase,
 * supporter perk, grant or free access). Fails closed, and makes no call when unconfigured.
 */
export async function hasLakesideEntitlement(
  ahdUserId: string,
  productId: string
): Promise<boolean> {
  const token = authConfig.accountsInternalToken()?.trim();
  if (!token) return false;
  const now = Date.now();
  const hit = cache.get(ahdUserId);
  if (hit && now < hit.until) return hit.paid.has(productId);

  let paid: ReadonlySet<string> = new Set();
  try {
    const base = (authConfig.accountsUrl()?.trim() || DEFAULT_ACCOUNTS_URL).replace(/\/+$/, "");
    const res = await fetch(
      `${base}/account/api/entitlements?ahdUserId=${encodeURIComponent(ahdUserId)}`,
      {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    if (res.status === 200) paid = parsePaidProductIds(await res.json());
  } catch {
    paid = new Set();
  }
  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(ahdUserId, { paid, until: now + CACHE_MS });
  return paid.has(productId);
}
