import type { Collection } from "mongodb";

import type { CollectionSource } from "./source";

/** One cached published IP list used by the VPN gate. */
export interface VpnIpListDoc {
  /** "vpn" (VPN and hosting ranges) or "privateRelay" (exempt ranges). */
  _id: "vpn" | "privateRelay";
  cidrs: string[];
  fetchedAt: Date;
  source: string;
}

/**
 * Typed handle on the `vpnIpLists` collection: the locally cached copies of
 * the published lists the VPN gate matches against, refreshed daily.
 */
export function vpnIpListsCollection(db: CollectionSource): Collection<VpnIpListDoc> {
  return db.collection<VpnIpListDoc>("vpnIpLists");
}
