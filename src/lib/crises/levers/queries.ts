import { getCharactersCollection } from "@/lib/db/collections/characters";
import { getCorporationsCollection } from "@/lib/db/collections/corporations";
import { getFederalBudgetCollection } from "@/lib/db/collections/federalBudget";
import { getStatesCollection } from "@/lib/db/collections/states";
import type { Db, ObjectId } from "mongodb";
import type { ActiveCrisisStage, CrisisRole, LeverCost } from "@/lib/crises/v2/types";
import { AID_DEFAULT_PCT_GDP, AID_MAX_PCT_GDP } from "@/lib/constants/crises";
import type { Crisis, CrisisInteraction, CrisisLeverUse } from "@/lib/db/types/crisis";
import { getGameState } from "@/lib/gameState";
import { resolveCrisisDefinition } from "@/lib/turn/crisisV2/ensureContent";
import { leverActionCost } from "@/lib/crises/v2/leverActions";
import { leverBlock } from "./availability";
import { governsAffectedState, leverInActorJurisdiction } from "./jurisdiction";
import { resolveLeverRoles } from "./roles";

/** Size bounds for an aid pledge, as shares of the sender's GDP. */
export interface AidPledgeRange {
  defaultPctGdp: number;
  maxPctGdp: number;
  /** The sender's GDP in local currency, for showing the amount. */
  senderGdp: number;
  currencyCode: string;
}

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
  /** Present on an aid pledge, which the holder sizes before pulling. */
  aid?: AidPledgeRange;
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
async function loadLegacyNodes(
  db: Db,
  crisisIds: ObjectId[],
  countryId: string | undefined
): Promise<{
  ranges: Map<string, AidPledgeRange>;
  nodeCountries: Map<string, Map<string, readonly string[]>>;
}> {
  const ranges = new Map<string, AidPledgeRange>();
  const nodeCountries = new Map<string, Map<string, readonly string[]>>();
  if (crisisIds.length === 0 || !countryId) return { ranges, nodeCountries };
  const [interactions, budget] = await Promise.all([
    db
      .collection<CrisisInteraction>("crisisInteractions")
      .find(
        { crisisId: { $in: crisisIds } },
        {
          projection: {
            crisisId: 1,
            "decisionTree.nodeId": 1,
            "decisionTree.type": 1,
            "decisionTree.requiredCountryIds": 1,
            "decisionTree.aidMaxPctGdp": 1,
            "decisionTree.aidDefaultPctGdp": 1,
          },
        }
      )
      .toArray(),
    getFederalBudgetCollection(db).then((budgets) => budgets.findOne({ countryId })),
  ]);
  const senderGdp =
    budget?.gdpSmoothed && budget.gdpSmoothed > 0 ? budget.gdpSmoothed : (budget?.gdp ?? 0);
  for (const interaction of interactions) {
    const gates = new Map<string, readonly string[]>();
    for (const n of interaction.decisionTree) {
      if (n.requiredCountryIds?.length) gates.set(n.nodeId, n.requiredCountryIds);
    }
    nodeCountries.set(interaction.crisisId.toString(), gates);
    const node = interaction.decisionTree.find((n) => n.type === "aid");
    const maxPctGdp = node?.aidMaxPctGdp ?? AID_MAX_PCT_GDP;
    ranges.set(interaction.crisisId.toString(), {
      defaultPctGdp: Math.min(node?.aidDefaultPctGdp ?? AID_DEFAULT_PCT_GDP, maxPctGdp),
      maxPctGdp,
      senderGdp,
      currencyCode: budget?.currencyCode ?? "USD",
    });
  }
  return { ranges, nodeCountries };
}

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

  const { ranges: aidRanges, nodeCountries } = await loadLegacyNodes(
    db,
    crises
      .filter((c) =>
        resolveCrisisDefinition(c.v2.definitionId)?.levers.some((l) => l.legacy !== undefined)
      )
      .map((c) => c._id),
    actor.countryId
  );

  const result: AvailableCrisisLevers[] = [];
  for (const crisis of crises) {
    const def = resolveCrisisDefinition(crisis.v2.definitionId);
    if (!def || crisis.v2.stage === "resolved") continue;
    const crisisCountries = countries.get(crisis._id.toString()) ?? null;

    const levers: AvailableLever[] = [];
    for (const lever of def.levers) {
      if (!roles.has(lever.role)) continue;
      if (
        lever.role === "corpCeo" &&
        crisisCountries !== null &&
        !crisisCountries.some((id) => corpCountries.has(id))
      )
        continue;
      if (!leverInActorJurisdiction(lever, crisisCountries, actor.countryId)) continue;
      const gate = lever.legacy
        ? nodeCountries.get(crisis._id.toString())?.get(lever.legacy.nodeId)
        : undefined;
      if (gate && (!actor.countryId || !gate.includes(actor.countryId))) continue;
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
        ...(lever.legacy?.kind === "aid" && aidRanges.has(crisis._id.toString())
          ? { aid: aidRanges.get(crisis._id.toString()) }
          : {}),
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
