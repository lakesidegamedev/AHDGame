import type { Db } from "mongodb";
import type { Election, PoliticalParty } from "@/lib/db/types";
import {
  isElectionRouteSeatId,
  resolveElectionRouteParam,
} from "@/lib/elections/electionParamResolution";
import { campaignManagerHref, primaryTierHref } from "@/lib/campaignManager/links";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { electionsCollection } from "@/lib/db/repositories/elections";

/**
 * Down-ballot races live in Campaign Manager; the old election pages redirect
 * there. These decide where an old URL goes, or return null to let the page
 * render as before (the presidency, and anything that does not resolve).
 */

/**
 * `/elections/<id>` (an ObjectId or a seat slug, optionally `?cycle=N`) and its
 * sub-pages: the race in Campaign Manager, or null for the presidency or an
 * election that does not exist.
 */
export async function downBallotRedirectTarget(
  db: Db,
  idParam: string,
  cycle?: number
): Promise<string | null> {
  let election: Pick<Election, "_id" | "electionType"> | null = null;
  if (cycle != null && isElectionRouteSeatId(idParam)) {
    election = await electionsCollection(db).findOne(
      { seatId: idParam, cycle, status: { $ne: "cancelled" } },
      { projection: { _id: 1, electionType: 1 } }
    );
  } else {
    const resolved = await resolveElectionRouteParam(db, idParam);
    election = resolved.ok ? resolved.election : null;
  }
  if (!election || election.electionType === "president") return null;
  return campaignManagerHref({ race: election._id.toHexString() });
}

const LOWER_TIERS: ReadonlySet<string> = new Set(["senate", "stateSenate", "governor", "house"]);

/**
 * `/elections/primary/<tier>/<party>`: that race type's primaries in Campaign
 * Manager, filtered to the party (a sequential id, or an abbreviation looked
 * up to one). Null for a tier the page does not serve.
 */
export async function primaryPageRedirectTarget(
  db: Db,
  tier: string,
  partyParam: string
): Promise<string | null> {
  if (!LOWER_TIERS.has(tier)) return null;
  if (/^\d+$/.test(partyParam)) return primaryTierHref(tier, partyParam);
  const party = await politicalPartiesCollection(db).findOne(
    { countryId: "US", abbreviation: partyParam },
    { projection: { sequentialId: 1 } }
  );
  return party
    ? primaryTierHref(tier, String(party.sequentialId))
    : campaignManagerHref({ type: tier, stage: "primary" });
}
