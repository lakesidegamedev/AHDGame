import { getStatesCollection } from "@/lib/db/collections/states";
import type { Db } from "mongodb";
import { applyCrisisEffects } from "@/lib/crises/applyEffects";
import type { CrisisEffect } from "@/lib/db/types/crisis";
import type { EffectIntent } from "@/lib/crises/v2/effectModule";

export interface IntentTargets {
  stateIds: string[];
  countryIds: string[];
}

export interface IntentRouting {
  applied: number;
  /** Intent kinds with no handler yet, with how many were dropped. */
  unsupported: Record<string, number>;
}

function legacyEffect(
  partial: Pick<CrisisEffect, "targetType" | "value"> & Partial<CrisisEffect>
): CrisisEffect {
  return {
    effectType: "tick",
    metricCategory: null,
    metricField: null,
    sectorType: null,
    strategyId: null,
    label: "Crisis",
    ...partial,
  };
}

/** The old writers understand these kinds; everything else needs its own handler. */
function toLegacyEffect(intent: EffectIntent): CrisisEffect | null {
  switch (intent.kind) {
    case "metric":
      return legacyEffect({
        targetType: "metric",
        metricCategory: intent.category,
        metricField: intent.field,
        value: intent.delta,
      });
    case "approval":
      return legacyEffect({ targetType: "approval", value: intent.delta });
    case "profitMargin":
      return legacyEffect({
        targetType: "profitMargin",
        sectorType: intent.sectorType,
        value: intent.points,
        physicality: intent.physical ? "physical" : "financial",
      });
    case "inflation":
      return legacyEffect({ targetType: "inflation", value: intent.delta });
    default:
      return null;
  }
}

/** Compounds fractional losses into one `$mul`, as the old engine did. */
async function applyGdpLoss(db: Db, stateIds: string[], fractions: number[]): Promise<void> {
  let factor = 1;
  for (const fraction of fractions) factor *= 1 - Math.max(0, Math.min(0.95, Math.abs(fraction)));
  if (factor >= 1 || stateIds.length === 0) return;
  const states = await getStatesCollection(db);
  await states.updateMany({ _id: { $in: stateIds } } as never, {
    $mul: { gdp: factor },
  });
}

/**
 * Sends a crisis's intents to the systems that own them. Legacy kinds go
 * through the existing effect writers; any other kind is counted and reported
 * as unsupported so a definition using it is visible rather than silently inert.
 */
export async function routeEffectIntents(
  db: Db,
  intents: readonly EffectIntent[],
  targets: IntentTargets
): Promise<IntentRouting> {
  const legacy: CrisisEffect[] = [];
  const gdpFractions: number[] = [];
  const unsupported: Record<string, number> = {};

  for (const intent of intents) {
    if (intent.kind === "gdpLoss") {
      gdpFractions.push(intent.fraction);
      continue;
    }
    const effect = toLegacyEffect(intent);
    if (effect) legacy.push(effect);
    else unsupported[intent.kind] = (unsupported[intent.kind] ?? 0) + 1;
  }

  if (targets.stateIds.length > 0 && legacy.length > 0) {
    await applyCrisisEffects(db, legacy, targets.stateIds, targets.countryIds);
  }
  if (gdpFractions.length > 0) await applyGdpLoss(db, targets.stateIds, gdpFractions);

  return { applied: legacy.length + gdpFractions.length, unsupported };
}
