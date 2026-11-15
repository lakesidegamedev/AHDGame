/**
 * National euro bills record consent, then settlement checks actual membership
 * and conversion readiness. A rejected or unavailable proposal changes nothing;
 * an enacted authorization can wait for the other founding governments.
 */
import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { GameState } from "@/lib/db/types/gameState";
import type { OrganizationMembership } from "@/lib/db/types/internationalOrganization";
import { resolveGameYear } from "@/lib/era/era";
import {
  euroAuthorizationRefusal,
  euroConsentedCountries,
  type EuroAdoptionConditions,
} from "./rules";
import { reconcileEuroMonetaryUnion } from "./service";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { organizationMembershipsCollection } from "@/lib/db/repositories/organizationMemberships";

export async function loadEuroAdoptionConditions(
  db: Db,
  countryId: CountryId
): Promise<EuroAdoptionConditions> {
  const [state, members] = await Promise.all([
    gameStateCollection(db).findOne(
      { _id: "current" },
      {
        projection: {
          currentYear: 1,
          currentTurn: 1,
          startingYear: 1,
          eurozoneEnabled: 1,
          euroAdoptedCountries: 1,
          euroMonetaryUnion: 1,
          europeanIntegration: 1,
        },
      }
    ),
    organizationMembershipsCollection(db)
      .find({ organizationId: "EU" }, { projection: { countryId: 1 } })
      .toArray(),
  ]);
  return {
    countryId,
    year: state ? (resolveGameYear(state) ?? 0) : 0,
    europeanMembers: members.map((member) => member.countryId),
    europeanStage: state?.europeanIntegration?.stage,
    consentedCountries: euroConsentedCountries(state ?? {}),
    union: state?.euroMonetaryUnion,
  };
}

export async function recordEuroAdoption(
  db: Db,
  countryId: CountryId,
  turn: number,
  billId: string
): Promise<void> {
  const conditions = await loadEuroAdoptionConditions(db, countryId);
  if (!conditions.consentedCountries.includes(countryId)) {
    const refusal = euroAuthorizationRefusal(conditions);
    if (refusal) throw new Error(refusal);
    await gameStateCollection(db).updateOne(
      { _id: "current", euroAdoptedCountries: { $ne: countryId } },
      {
        $addToSet: { euroAdoptedCountries: countryId },
        $set: { [`euroAdoptionAuthorizations.${countryId}`]: { billId, turn } },
      }
    );
  }
  await reconcileEuroMonetaryUnion(db, turn);
}
