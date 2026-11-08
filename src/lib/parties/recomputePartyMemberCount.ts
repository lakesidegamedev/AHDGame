import type { Db } from "mongodb";
import type { PoliticalParty } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";

/**
 * Recompute and persist a party's denormalized `memberCount` from live
 * membership: characters affiliated to the party plus active (non-retired)
 * NPPs, scoped to the country. Returns the recomputed total.
 *
 * `memberCount` is cached and maintained by many `$inc ±1` sites, so it
 * drifts. Bulk party-split paths call this instead of blind decrements,
 * which could drive the count negative and break the leadership-election
 * accelerator that skips parties with stored count `<= 0`.
 *
 * Banned members are stripped from membership elsewhere, so a straight
 * affiliation count matches the live-derived roster.
 */
export async function recomputePartyMemberCount(
  db: Db,
  countryId: CountryId,
  sequentialId: number
): Promise<number> {
  const partyKey = String(sequentialId);
  const [characterCount, nppCount] = await Promise.all([
    db.collection("characters").countDocuments({ party: partyKey, countryId }),
    db.collection("npps").countDocuments({ party: partyKey, countryId, retiredAt: null }),
  ]);
  const memberCount = characterCount + nppCount;
  await db
    .collection<PoliticalParty>("politicalParties")
    .updateOne({ sequentialId, countryId }, { $set: { memberCount, updatedAt: new Date() } });
  return memberCount;
}
