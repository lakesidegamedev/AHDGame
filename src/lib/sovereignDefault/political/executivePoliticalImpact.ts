/**
 * Executive political (favorability, infamy) impact per sovereign-default
 * resolution choice, anchored to real post-default incumbent outcomes.
 */

import type { Db, ObjectId } from "mongodb";
import type { SovereignResolutionChoice } from "@/lib/db/types/budget";
import { charactersCollection } from "@/lib/db/repositories/characters";

export interface ExecutivePoliticalImpact {
  favorabilityDelta: number;
  infamyDelta: number;
}

const IMPACT_BY_PATH: Record<SovereignResolutionChoice, ExecutivePoliticalImpact> = {
  repudiate: { favorabilityDelta: -20, infamyDelta: 15 },
  monetize: { favorabilityDelta: -15, infamyDelta: 10 },
  bailout: { favorabilityDelta: -10, infamyDelta: 5 },
  restructure: { favorabilityDelta: -8, infamyDelta: 5 },
};

export function computeExecutivePoliticalImpact(
  choice: SovereignResolutionChoice
): ExecutivePoliticalImpact {
  return IMPACT_BY_PATH[choice];
}

/**
 * Apply the calibrated impact to the proposing character. No-op when
 * `characterId` is null (NPC executive — political impact for NPPs is
 * separate and runs through their own favorability system).
 */
export async function applyExecutivePoliticalImpact(
  db: Db,
  characterId: ObjectId | null | undefined,
  choice: SovereignResolutionChoice
): Promise<{ applied: boolean }> {
  if (!characterId) return { applied: false };
  const impact = computeExecutivePoliticalImpact(choice);
  await charactersCollection(db).updateOne(
    { _id: characterId },
    {
      $inc: {
        favorability: impact.favorabilityDelta,
        infamy: impact.infamyDelta,
      },
    }
  );
  return { applied: true };
}
