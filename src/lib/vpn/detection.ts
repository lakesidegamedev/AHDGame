import { getDb } from "@/lib/mongodb";
import { vpnIpListsCollection, type VpnIpListDoc } from "@/lib/db/repositories/vpnIpLists";
import {
  buildRangeSet,
  emptyRangeSet,
  parseCidrList,
  rangeSetHas,
  type IpRangeSet,
} from "./ipRanges";

/**
 * VPN detection for the VPN gate and alt scoring.
 *
 * Every check runs locally against cached copies of published range lists.
 * No player address is ever sent to an outside service: the only network
 * calls fetch the public lists themselves.
 *
 * Fails open everywhere: a missing list, a DB error or a fetch error means
 * "not a VPN", so an outage never locks players out.
 */

/** Cloudflare WARP egress ranges. Always included, independent of the fetched lists. */
export const WARP_CIDRS = ["2a09:bac0::/29", "104.28.0.0/16"];

export const VPN_LIST_SOURCE =
  "https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt";
export const PRIVATE_RELAY_LIST_SOURCE = "https://mask-api.icloud.com/egress-ip-ranges.csv";

const MEMORY_TTL_MS = 10 * 60 * 1000;
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 30 * 1000;

export type IpClassification = "vpn" | "private_relay" | "clear";

interface LoadedRanges {
  vpn: IpRangeSet;
  privateRelay: IpRangeSet;
  loadedAt: number;
}

const warpSet = buildRangeSet(WARP_CIDRS);
let loaded: LoadedRanges | null = null;
let loading: Promise<void> | null = null;
let refreshing: Promise<void> | null = null;

/** Classify against already-loaded ranges. Private Relay wins over VPN. */
export function classifyWithRanges(
  ip: string,
  ranges: { vpn: IpRangeSet; privateRelay: IpRangeSet }
): IpClassification {
  if (!ip || ip === "unknown") return "clear";
  if (rangeSetHas(ranges.privateRelay, ip)) return "private_relay";
  if (rangeSetHas(warpSet, ip) || rangeSetHas(ranges.vpn, ip)) return "vpn";
  return "clear";
}

async function fetchList(url: string): Promise<string[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`VPN list fetch failed: ${res.status}`);
  return parseCidrList(await res.text());
}

/** Fetch both published lists and store them. Exported for tests and manual refresh. */
export async function refreshVpnLists(): Promise<void> {
  const db = await getDb();
  const col = vpnIpListsCollection(db);
  const lists: Array<[VpnIpListDoc["_id"], string]> = [
    ["vpn", VPN_LIST_SOURCE],
    ["privateRelay", PRIVATE_RELAY_LIST_SOURCE],
  ];
  for (const [id, source] of lists) {
    try {
      const cidrs = await fetchList(source);
      // An implausibly small download is treated as a failed fetch so a
      // truncated response never replaces a good cached list.
      if (cidrs.length < 100) continue;
      await col.updateOne(
        { _id: id },
        { $set: { cidrs, fetchedAt: new Date(), source } },
        { upsert: true }
      );
    } catch (err) {
      console.warn(`[vpn] refresh of ${id} list failed`, err);
    }
  }
  loaded = null;
}

async function loadFromDb(): Promise<void> {
  try {
    const db = await getDb();
    const docs = await vpnIpListsCollection(db).find({}).toArray();
    const vpnDoc = docs.find((d) => d._id === "vpn");
    const relayDoc = docs.find((d) => d._id === "privateRelay");
    loaded = {
      vpn: vpnDoc ? buildRangeSet(vpnDoc.cidrs) : emptyRangeSet(),
      privateRelay: relayDoc ? buildRangeSet(relayDoc.cidrs) : emptyRangeSet(),
      loadedAt: Date.now(),
    };
    const oldest = Math.min(vpnDoc?.fetchedAt?.getTime() ?? 0, relayDoc?.fetchedAt?.getTime() ?? 0);
    const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
    if (Date.now() - oldest > REFRESH_AFTER_MS && !refreshing && !isTest) {
      // Background refresh; the current request never waits on the network.
      refreshing = refreshVpnLists().finally(() => {
        refreshing = null;
      });
    }
  } catch (err) {
    console.warn("[vpn] loading lists failed; failing open", err);
    loaded = { vpn: emptyRangeSet(), privateRelay: emptyRangeSet(), loadedAt: Date.now() };
  }
}

/** Make sure ranges are in memory (refreshing them when the cache is stale). */
export async function ensureVpnRangesLoaded(): Promise<void> {
  if (loaded && Date.now() - loaded.loadedAt < MEMORY_TTL_MS) return;
  if (!loading) {
    loading = loadFromDb().finally(() => {
      loading = null;
    });
  }
  await loading;
}

/** Classify a client IP. Never throws. */
export async function classifyIp(ip: string): Promise<IpClassification> {
  await ensureVpnRangesLoaded();
  return classifyIpSync(ip);
}

/**
 * Classify using whatever is already in memory (WARP only before the first
 * load). For hot loops that called {@link ensureVpnRangesLoaded} first.
 */
export function classifyIpSync(ip: string): IpClassification {
  return classifyWithRanges(ip, loaded ?? { vpn: emptyRangeSet(), privateRelay: emptyRangeSet() });
}

/** Test hook: drop the in-memory cache. */
export function resetVpnDetectionCacheForTests(): void {
  loaded = null;
  loading = null;
  refreshing = null;
}
