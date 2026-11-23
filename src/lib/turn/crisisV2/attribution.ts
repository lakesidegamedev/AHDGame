import { ObjectId, type Db } from "mongodb";
import type { AccountabilityAttribution } from "@/lib/crises/v2/types";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { nppsCollection } from "@/lib/db/repositories/npps";

export async function loadAccountabilityAttributions(db: Db, holderIds: readonly string[]) {
  const ids = [...new Set(holderIds)]
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
  const result = new Map<string, AccountabilityAttribution>();
  if (ids.length === 0) return result;
  const projection = { countryId: 1, party: 1, currentOffice: 1 };
  const [characters, npps] = await Promise.all([
    charactersCollection(db)
      .find({ _id: { $in: ids } }, { projection })
      .toArray(),
    nppsCollection(db)
      .find({ _id: { $in: ids } }, { projection })
      .toArray(),
  ]);
  for (const actor of [...npps, ...characters]) {
    if (!actor.countryId) continue;
    const office = actor.currentOffice;
    const stateId =
      office && typeof office === "object" && "state" in office ? office.state : undefined;
    result.set(actor._id.toString(), {
      countryId: actor.countryId,
      ...(stateId ? { stateId: stateId.toUpperCase() } : {}),
      ...(actor.party ? { partyId: actor.party } : {}),
    });
  }
  return result;
}
