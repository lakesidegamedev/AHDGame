import type { Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { getOperatingSectorType } from "@/lib/constants/sectorStrategies";
import {
  frontierProgrammeCost,
  frontierPurchaseCount,
  isFrontierOpen,
  type FrontierProgrammeKind,
} from "@/lib/constants/techTree";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

export type BuyFrontierProgrammeResult =
  | {
      ok: true;
      status: 200;
      kind: FrontierProgrammeKind;
      rdCost: number;
      purchases: number;
      rdScoreRemaining: number;
    }
  | { ok: false; status: number; error: string };

/** Guard a count read before the write: equal to what was read, or absent when 0. */
function countGuard(field: string, value: number): Record<string, unknown> {
  return value > 0 ? { [field]: value } : { [field]: { $in: [0, null] } };
}

/**
 * Buy one frontier programme (lib/constants/techTree/frontier) for the
 * corporation's sector. Spends rdScore only; the price rises 15% per previous
 * programme of either kind. One guarded update enforces affordability and the
 * purchase count read here, so concurrent purchases cannot both pay the old
 * price.
 *
 * Caller handles auth (CEO), the feature gate, and resolving the corporation.
 */
export async function buyFrontierProgramme(
  db: Db,
  corporation: Corporation,
  kind: FrontierProgrammeKind,
  currentYear: number
): Promise<BuyFrontierProgrammeResult> {
  const techType = getOperatingSectorType(
    corporation.type,
    corporation.industryModel,
    corporation.mediaDiscriminator
  );
  if (!isFrontierOpen(corporation, techType, currentYear)) {
    return {
      ok: false,
      status: 409,
      error: "Finish the last research tier in your committed track to open frontier programmes.",
    };
  }
  const outputCount = corporation.frontierProgrammes?.output ?? 0;
  const inputCount = corporation.frontierProgrammes?.input ?? 0;
  const purchases = frontierPurchaseCount(corporation.frontierProgrammes);
  const rdCost = frontierProgrammeCost(purchases);
  const rdScore = corporation.rdScore ?? 0;
  if (rdScore < rdCost) {
    return { ok: false, status: 402, error: "Not enough R&D points for this programme." };
  }

  const updateResult = await corporationsCollection(db).updateOne(
    {
      _id: corporation._id,
      rdScore: { $gte: rdCost },
      $and: [
        countGuard("frontierProgrammes.output", outputCount),
        countGuard("frontierProgrammes.input", inputCount),
      ],
    },
    {
      $inc: {
        rdScore: -rdCost,
        frontierResearchSpent: rdCost,
        [`frontierProgrammes.${kind}`]: 1,
      },
      $set: { updatedAt: new Date() },
    }
  );
  if (updateResult.modifiedCount === 0) {
    return {
      ok: false,
      status: 409,
      error: "The programme could not be bought because the research state changed. Please retry.",
    };
  }
  return {
    ok: true,
    status: 200,
    kind,
    rdCost,
    purchases: purchases + 1,
    rdScoreRemaining: rdScore - rdCost,
  };
}
