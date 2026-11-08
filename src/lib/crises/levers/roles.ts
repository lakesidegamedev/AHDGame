import type { Db, ObjectId } from "mongodb";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { resolveCharacterRoles } from "@/lib/crises/interactionEngine";
import type { CrisisRole } from "@/lib/crises/v2/types";
import type { Corporation } from "@/lib/db/types";
import type { CongressLeader } from "@/lib/db/types/leadership";
import { LEGISLATURE_LEADER_ROLES } from "@/lib/turn/crisisV2/holderProviders";

export interface LeverActor {
  _id: ObjectId;
  countryId?: string;
  currentOffice?: { type?: string; positionId?: string; state?: string } | null;
}

function isLegislativeOffice(actor: LeverActor): boolean {
  const type = actor.currentOffice?.type;
  const config = actor.countryId ? COUNTRY_CONFIGS[actor.countryId as CountryId] : undefined;
  if (!type || !config) return false;
  return config.officeTypes.some(
    (office) =>
      office.key === type && !office.isExecutive && !office.isSubNational && !!office.chamberKey
  );
}

/**
 * Crisis roles a character holds right now. Reuses the crisis interaction role
 * derivation so "who can respond" agrees across both crisis engines, then adds
 * the roles that engine has no word for: legislators and corporate CEOs.
 * `countryIds` bounds the CEO check to corporations the crisis can touch;
 * null means no bound.
 */
export async function resolveLeverRoles(
  db: Db,
  actor: LeverActor,
  countryIds: readonly string[] | null
): Promise<Set<CrisisRole>> {
  const derived = await resolveCharacterRoles(db, actor);
  const roles = new Set<CrisisRole>();
  for (const role of [
    "headOfState",
    "stateGovernor",
    "financeMinister",
    "centralBankChair",
    "partyLeader",
  ] as const) {
    if (derived.includes(role)) roles.add(role);
  }

  const [leader, ceo] = await Promise.all([
    isLegislativeOffice(actor)
      ? Promise.resolve(true)
      : db
          .collection<CongressLeader>("congressLeaders")
          .findOne(
            { characterId: actor._id, role: { $in: [...LEGISLATURE_LEADER_ROLES] } },
            { projection: { _id: 1 } }
          )
          .then(Boolean),
    db.collection<Corporation>("corporations").findOne(
      {
        ceoId: actor._id,
        ceoType: { $nin: ["npp", "imperial"] },
        ...(countryIds ? { countryId: { $in: countryIds as CountryId[] } } : {}),
      },
      { projection: { _id: 1 } }
    ),
  ]);
  if (leader) roles.add("legislature");
  if (ceo) roles.add("corpCeo");
  return roles;
}
