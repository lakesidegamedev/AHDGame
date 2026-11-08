import { NextResponse } from "next/server";
import type { Db, ObjectId } from "mongodb";
import { forbidden } from "@/lib/api/errors";
import type { CountryId } from "@/lib/constants/countries";
import { FOREIGN_AFFAIRS_POSITION_BY_COUNTRY } from "@/lib/constants/internationalOrganizations";
import { getCabinetMembersCollection } from "@/lib/db/collections/cabinetMembers";
import { getHeadOfGovernmentCharacterId } from "@/lib/api/headOfGovernment";

export type PeaceNegotiatorResult =
  | { ok: true; via: "head_of_government" | "foreign_minister" | "admin" }
  | { ok: false; response: NextResponse };

/**
 * May this character negotiate peace for this country?
 *
 * Head of government OR the foreign seat holder, with no precedence between them,
 * mirroring the declare-war route's `isHog || isDefence` gate. Deliberately not
 * `requireForeignMinister`, which gives a seated minister exclusivity and refuses
 * the head of government.
 *
 * `via` names which of the two authorized the actor. No route branches on it; it
 * exists so a test can assert the head-of-government path was taken while a
 * minister held the seat.
 *
 * Admins bypass, matching the declare-war route, so an admin never sees a working
 * declaration button beside a peace form that 403s.
 */
export async function requirePeaceNegotiator(
  db: Db,
  countryId: CountryId,
  actorCharacterId: ObjectId,
  isAdmin = false
): Promise<PeaceNegotiatorResult> {
  if (isAdmin) return { ok: true, via: "admin" };
  const actor = actorCharacterId.toString();

  // Resolved through the shared helper because it branches on the RUNTIME
  // government type: presidential leaders are a row in `electedOfficials`, while
  // parliamentary ones live in `governmentFormations.pmCharacterId`. Reading either
  // collection directly gets the other government type wrong — which is exactly the
  // bug that stopped the US President declaring war.
  const hog = await getHeadOfGovernmentCharacterId(db, countryId);
  if (hog && hog.toString() === actor) return { ok: true, via: "head_of_government" };

  const seat = FOREIGN_AFFAIRS_POSITION_BY_COUNTRY[countryId];
  if (seat) {
    const member = await getCabinetMembersCollection(db).findOne({
      countryId,
      positionId: seat,
    });
    // An NPP-held seat carries a null characterId: it belongs to no player, so it
    // authorizes nobody — and it does not block the head of government above.
    if (member?.characterId && member.characterId.toString() === actor) {
      return { ok: true, via: "foreign_minister" };
    }
  }

  return {
    ok: false,
    response: NextResponse.json(
      forbidden(
        `Only the ${countryId} head of government or foreign minister may negotiate peace.`
      ).toJson(),
      { status: 403 }
    ),
  };
}
