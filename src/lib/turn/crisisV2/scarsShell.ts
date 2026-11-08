import type { Db } from "mongodb";
import type { EffectIntent } from "@/lib/crises/v2/effectModule";
import { stepScars, type ScarStep } from "@/lib/crises/v2/scars";
import type { Crisis } from "@/lib/db/types/crisis";
import type { State } from "@/lib/db/types/state";
import { logger } from "@/lib/observability/logger";
import { routeEffectIntents } from "./intents";

const COMPONENT = "crisisV2Scars";

/** Basis points of sovereign premium a fully lost credit standing is worth. */
const CREDIT_BPS_PER_UNIT = 10_000;
/** Approval points a fully lost institutional trust is worth. */
const TRUST_POINTS_PER_UNIT = 100;

interface ScarWorld {
  stateIdsByCountry: Map<string, string[]>;
  countryByState: Map<string, string>;
}

async function loadScarWorld(db: Db): Promise<ScarWorld> {
  const states = await db
    .collection<State>("states")
    .find({}, { projection: { _id: 1, countryId: 1 } })
    .toArray();
  const stateIdsByCountry = new Map<string, string[]>();
  const countryByState = new Map<string, string>();
  for (const state of states) {
    stateIdsByCountry.set(state.countryId, [
      ...(stateIdsByCountry.get(state.countryId) ?? []),
      state._id,
    ]);
    countryByState.set(state._id, state.countryId);
  }
  return { stateIdsByCountry, countryByState };
}

/** The states and countries a scar's target stands for. */
function resolveTarget(
  targetId: string,
  world: ScarWorld
): { stateIds: string[]; countryId?: string } {
  const countryStates = world.stateIdsByCountry.get(targetId);
  if (countryStates) return { stateIds: countryStates, countryId: targetId };
  const countryId = world.countryByState.get(targetId);
  return { stateIds: countryId ? [targetId] : [], countryId };
}

/** Turns one healing step into the intent the owning system already understands. */
function stepIntent(step: ScarStep, stateIds: readonly string[]): EffectIntent | null {
  switch (step.scar.kind) {
    case "population":
      return { kind: "migration", fraction: step.change / Math.max(1, stateIds.length) };
    case "institutionalTrust":
      return { kind: "approval", delta: -step.change * TRUST_POINTS_PER_UNIT };
    case "creditStanding":
      return { kind: "bondYield", deltaBps: step.change * CREDIT_BPS_PER_UNIT };
    default:
      return null;
  }
}

export interface ScarPassResult {
  advanced: number;
  failed: number;
}

/**
 * Advances every crisis's scars one turn, active or resolved, until the last
 * has healed. Output scars are read live by the plant lookup; the rest are
 * written to their systems as the difference from what was last applied. The
 * turn is claimed before anything is written, so a rerun cannot heal twice.
 */
export async function processCrisisScars(db: Db, turn: number): Promise<ScarPassResult> {
  const result: ScarPassResult = { advanced: 0, failed: 0 };
  const crises = db.collection<Crisis>("crises");
  const due = await crises
    .find(
      { scarsHealUntil: { $gte: turn }, "v2.lastScarTurn": { $not: { $gte: turn } } },
      { projection: { "v2.scars": 1 } }
    )
    .toArray();
  if (due.length === 0) return result;

  let world: ScarWorld | undefined;
  for (const crisis of due) {
    try {
      const claim = await crises.updateOne(
        { _id: crisis._id, "v2.lastScarTurn": { $not: { $gte: turn } } },
        { $set: { "v2.lastScarTurn": turn } }
      );
      if (claim.matchedCount === 0) continue;
      const { scars, steps } = stepScars(crisis.v2?.scars ?? [], turn);
      if (steps.length > 0) {
        world ??= await loadScarWorld(db);
        for (const step of steps) {
          const target = resolveTarget(step.scar.targetId, world);
          const intent = stepIntent(step, target.stateIds);
          if (!intent || !target.countryId) continue;
          await routeEffectIntents(db, [intent], {
            stateIds: target.stateIds,
            countryIds: [target.countryId],
            turn,
          });
        }
        await crises.updateOne({ _id: crisis._id }, { $set: { "v2.scars": scars } });
      }
      result.advanced += 1;
    } catch (error) {
      result.failed += 1;
      logger.error(COMPONENT, "scar step failed; retried next turn", error, {
        crisisId: crisis._id.toString(),
      });
    }
  }
  return result;
}
