import { getCharactersCollection } from "@/lib/db/collections/characters";
import { getCorporationsCollection } from "@/lib/db/collections/corporations";
import { getStatesCollection } from "@/lib/db/collections/states";
import type { Db, ObjectId } from "mongodb";
import type { ActiveCrisisStage, CrisisRole, LeverCost } from "@/lib/crises/v2/types";
import type { Crisis, CrisisLeverUse } from "@/lib/db/types/crisis";
import { getGameState } from "@/lib/gameState";
import { getCrisisDefinition } from "@/lib/turn/crisisV2/registry";
import { leverActionCost } from "@/lib/crises/v2/leverActions";
import { leverBlock } from "./availability";
import { governsAffectedState } from "./jurisdiction";
import { resolveLeverRoles } from "./roles";

export interface AvailableLever {
  id: string;
  label: string;
  role: CrisisRole;
  mitigation: number;
  cost: LeverCost;
  cooldownTurns: number;
  /** Action points the holder spends from their per-turn budget. */
  actionCost: number;
  /** True when pulling it raises an emergency bill rather than acting directly. */
  viaBill: boolean;
}

export interface AvailableCrisisLevers {
  crisisId: string;
  definitionId: string;
  label: string;
  stage: ActiveCrisisStage;
  severity: number;
  levers: AvailableLever[];
}

type LiveCrisis = Pick<Crisis, "_id" | "scope" | "countryIds" | "regionIds"> &
  Required<Pick<Crisis, "v2">>;

async function countriesOf(db: Db, crises: LiveCrisis[]): Promise<Map<string, string[] | null>> {
  const result = new Map<string, string[] | null>();
  const regionOnly = crises.filter(
    (c) => c.scope !== "global" && c.countryIds.length === 0 && c.regionIds.length > 0
  );
  const countryByState = new Map<string, string>();
  if (regionOnly.length > 0) {
    const states = await (
      await getStatesCollection(db)
    )
      .find(
        { _id: { $in: [...new Set(regionOnly.flatMap((c) => c.regionIds))] } },
        { projection: { countryId: 1 } }
      )
      .toArray();
    for (const state of states) countryByState.set(state._id, state.countryId);
  }
  for (const crisis of crises) {
    const key = crisis._id.toString();
    if (crisis.scope === "global") result.set(key, null);
    else if (crisis.countryIds.length > 0) result.set(key, crisis.countryIds);
    else {
      result.set(key, [...new Set(crisis.regionIds.flatMap((id) => countryByState.get(id) ?? []))]);
    }
  }
  return result;
}

/**
 * Crises with at least one lever this character can pull right now, with those
 * levers. Reads only the partial index of live v2 crises, the character's
 * roles, and that character's recent pulls, so it is cheap enough for a nav
 * badge as well as the crises page.
 */
export async function getAvailableLevers(
  db: Db,
  characterId: ObjectId
): Promise<AvailableCrisisLevers[]> {
  const actor = await (
    await getCharactersCollection(db)
  ).findOne({ _id: characterId }, { projection: { countryId: 1, currentOffice: 1 } });
  if (!actor) return [];

  const crises = (await db
    .collection<Crisis>("crises")
    .find(
      { status: "active", "v2.definitionId": { $exists: true } },
      { projection: { scope: 1, countryIds: 1, regionIds: 1, v2: 1 } }
    )
    .toArray()) as unknown as LiveCrisis[];
  if (crises.length === 0) return [];

  const [turn, roles, countries, corps] = await Promise.all([
    getGameState(db).then((state) => state?.currentTurn ?? 0),
    resolveLeverRoles(db, actor, null),
    countriesOf(db, crises),
    (await getCorporationsCollection(db))
      .find(
        { ceoId: actor._id, ceoType: { $nin: ["npp", "imperial"] } },
        { projection: { countryId: 1 } }
      )
      .toArray(),
  ]);
  if (roles.size === 0) return [];
  const corpCountries = new Set<string>(corps.map((corp) => corp.countryId));

  const holder = actor._id.toString();
  const pulls = await db
    .collection<CrisisLeverUse>("crisisLeverUses")
    .find(
      { crisisId: { $in: crises.map((c) => c._id) }, holderId: holder },
      { projection: { crisisId: 1, leverId: 1, submittedTurn: 1 } }
    )
    .toArray();
  const lastPulled = new Map<string, number>();
  for (const pull of pulls) {
    const key = `${pull.crisisId.toString()}:${pull.leverId}`;
    lastPulled.set(key, Math.max(lastPulled.get(key) ?? -Infinity, pull.submittedTurn));
  }

  const result: AvailableCrisisLevers[] = [];
  for (const crisis of crises) {
    const def = getCrisisDefinition(crisis.v2.definitionId);
    if (!def || crisis.v2.stage === "resolved") continue;
    const crisisCountries = countries.get(crisis._id.toString()) ?? null;
    const inCountry = (id: string | undefined) =>
      crisisCountries === null || (!!id && crisisCountries.includes(id));

    const levers: AvailableLever[] = [];
    for (const lever of def.levers) {
      if (!roles.has(lever.role)) continue;
      const inScope =
        lever.role === "corpCeo"
          ? crisisCountries === null || crisisCountries.some((id) => corpCountries.has(id))
          : inCountry(actor.countryId);
      if (!inScope) continue;
      if (lever.role === "stateGovernor" && !governsAffectedState(actor, crisis)) continue;
      const block = leverBlock(
        crisis.v2,
        lever,
        holder,
        turn,
        lastPulled.get(`${crisis._id.toString()}:${lever.id}`)
      );
      if (block) continue;
      levers.push({
        id: lever.id,
        label: lever.label,
        role: lever.role,
        mitigation: lever.mitigation,
        cost: lever.cost,
        cooldownTurns: lever.cooldownTurns ?? 0,
        actionCost: leverActionCost(lever.cost.politicalCapital),
        viaBill: lever.role === "legislature",
      });
    }
    if (levers.length === 0) continue;
    result.push({
      crisisId: crisis._id.toString(),
      definitionId: def.id,
      label: def.label,
      stage: crisis.v2.stage as ActiveCrisisStage,
      severity: crisis.v2.severity,
      levers,
    });
  }
  return result;
}
