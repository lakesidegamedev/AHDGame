import { ObjectId, type Db } from "mongodb";
import type { Crisis } from "@/lib/db/types/crisis";
import { createCrisisInstance } from "@/lib/crises/v2/instance";
import {
  getCrisisDefinition,
  registerCrisisDefinition,
  registerCrisisEffectModule,
  registerCrisisInputProvider,
} from "@/lib/turn/crisisV2/registry";
import { getConflictsCollection } from "@/lib/db/collections/conflicts";
import { logger } from "@/lib/observability/logger";
import type { ConflictParticipants } from "./driver";
import { nationsForRoles } from "./driver";
import { allLivingConflictDefs } from "./registry";
import {
  CAMPAIGN_DEFINITION_PREFIX,
  CAMPAIGN_EFFECT_MODULES,
  campaignDefinitionId,
  campaignIntensityInput,
  convertLivingConflictDef,
} from "./rules/crisisV2";
import type { LivingConflictDef, LivingConflictState } from "./types";
import { vietnamWorldPressure, type ActiveWarSnapshot } from "./worldPressure";
import { crisesCollection } from "@/lib/db/repositories/crises";

const COMPONENT = "livingConflictCampaign";

/** Whether a crisis document mirrors a campaign rather than being an event of its own. */
export function isCampaignCrisis(crisis: { v2?: { definitionId: string } }): boolean {
  return crisis.v2?.definitionId.startsWith(CAMPAIGN_DEFINITION_PREFIX) === true;
}

/**
 * Registers each campaign as a v2 definition with its rule modules and an input
 * that reads the conflict's own intensity, so the v2 phase can step the mirror
 * crisis without knowing anything about conflicts. Idempotent.
 */
export function ensureCampaignCrisisContent(): void {
  const defs = allLivingConflictDefs();
  if (defs.length === 0 || getCrisisDefinition(campaignDefinitionId(defs[0].key))) return;
  for (const mod of CAMPAIGN_EFFECT_MODULES) registerCrisisEffectModule(mod);
  for (const def of defs) {
    registerCrisisDefinition(convertLivingConflictDef(def));
    registerCrisisInputProvider({
      input: campaignIntensityInput(def.key),
      async load(ctx) {
        const state = await ctx.db
          .collection<LivingConflictState>("livingConflicts")
          .findOne({ defKey: def.key }, { projection: { intensity: 1, hasOpened: 1 } });
        const values = new Map<string, number>();
        if (!state?.hasOpened || typeof state.intensity !== "number") return values;
        for (const countryId of ctx.countryIds) values.set(countryId, state.intensity);
        return values;
      },
    });
  }
  registerCrisisInputProvider({
    input: "worldPressure.vietnam",
    async load(ctx) {
      const [tension, wars] = await Promise.all([
        ctx.db
          .collection<{ _id: string; value?: number }>("coldWarTension")
          .findOne({ _id: "current" }),
        getConflictsCollection(ctx.db).find({ status: "active" }).toArray(),
      ]);
      const pressure = vietnamWorldPressure(
        tension?.value ?? 0,
        wars as unknown as ActiveWarSnapshot[]
      );
      return new Map([...ctx.countryIds].map((id) => [id, pressure]));
    },
  });
}

/** Test seam. */
export function resetCampaignCrisisContentForTests(): void {}

export interface CampaignTurnState {
  def: LivingConflictDef;
  state: LivingConflictState;
  participants: ConflictParticipants;
}

const LIVE_STATUSES = new Set(["active", "ceasefire", "negotiating"]);
const ENDED_STATUSES = new Set(["settled", "closed"]);

/**
 * Keeps one v2 crisis per campaign alongside the conflict's own state: opens it
 * once when the conflict opens, and closes it when the conflict settles or is
 * closed. The campaign's phases, tracks and response windows stay with the
 * conflict engine; the crisis is how the world sees and stages it.
 */
export async function syncCampaignCrises(
  db: Db,
  turn: number,
  campaigns: readonly CampaignTurnState[]
): Promise<{ opened: number; closed: number }> {
  ensureCampaignCrisisContent();
  const ids = campaigns.map(({ def }) => campaignDefinitionId(def.key));
  if (ids.length === 0) return { opened: 0, closed: 0 };
  const existing = await crisesCollection(db)
    .find({ "v2.definitionId": { $in: ids } }, { projection: { status: 1, "v2.definitionId": 1 } })
    .toArray();
  const byDefinition = new Map(existing.map((row) => [row.v2?.definitionId, row]));

  const inserts: Crisis[] = [];
  const closeIds: ObjectId[] = [];
  for (const { def, state, participants } of campaigns) {
    const id = campaignDefinitionId(def.key);
    const row = byDefinition.get(id);
    const status = state.status ?? "active";
    if (!row && state.hasOpened && LIVE_STATUSES.has(status)) {
      const definition = convertLivingConflictDef(def);
      const phase = def.phases.find((p) => p.level === state.phaseLevel);
      inserts.push({
        _id: new ObjectId(),
        name: def.name,
        description: phase?.summary ?? def.name,
        scope: "global",
        countryIds: nationsForRoles(participants, [
          "belligerent",
          "backer_a",
          "backer_b",
          "neighbor",
        ]),
        regionIds: [],
        status: "active",
        startTurn: turn,
        endTurn: null,
        durationTurns: null,
        effects: [],
        wireMessageOnStart: def.name,
        wireMessageOnEnd: null,
        createdBy: null,
        createdAt: new Date(),
        resolvedAt: null,
        autoGenerated: true,
        v2: createCrisisInstance(definition, turn, { scope: "global" }),
      });
    } else if (row?.status === "active" && state.hasOpened && ENDED_STATUSES.has(status)) {
      closeIds.push(row._id);
    }
  }
  try {
    if (inserts.length > 0)
      await crisesCollection(db).insertMany(inserts, { ordered: false });
    if (closeIds.length > 0) {
      await crisesCollection(db).updateMany(
        { _id: { $in: closeIds }, status: "active" },
        {
          $set: {
            status: "resolved",
            endTurn: turn,
            resolvedAt: new Date(),
            "v2.stage": "resolved",
            "v2.stageStartTurn": turn,
          },
        }
      );
    }
  } catch (error) {
    logger.error(COMPONENT, "campaign crisis sync failed", error);
    return { opened: 0, closed: 0 };
  }
  return { opened: inserts.length, closed: closeIds.length };
}
