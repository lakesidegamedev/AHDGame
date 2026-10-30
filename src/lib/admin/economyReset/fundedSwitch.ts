/**
 * Switch a rebuilt economy onto the funded producer market.
 *
 * scripts/migrations/resetAndSwitchEconomy.ts runs this straight after the
 * producer opening, at the same turn: the reset switches the transition package
 * off, so a rebuilt economy has no warm-up class to land and the funded rules
 * start on the next turn. The config write is the one proven in rehearsal.
 *
 * The opening marker is the only proof this world is converted, so it is
 * checked before anything is written. Running it again on a switched world is a
 * no-op success, which is what makes a resumed apply safe.
 */
import type { Db, Document, UpdateFilter } from "mongodb";
import type { GameConfig } from "@/lib/db/types/gameConfig";
import type { GameState } from "@/lib/db/types/gameState";

/** Funded rules a rebuilt economy starts with, keyed from its last legacy turn. */
export function fundedSwitchGameConfigUpdate(currentTurn: number): UpdateFilter<GameConfig> {
  if (!Number.isSafeInteger(currentTurn) || currentTurn < 0)
    throw new Error("The funded switch needs a whole, non-negative turn number");
  return {
    $set: {
      marketRecoveryStage: 0,
      producerMarketLiveFromTurn: currentTurn + 1,
      producerDemandPlanStage: 1,
      producerLowUseCostStage: 1,
      producerIdleRetireStage: 1,
      producerSpilloverStage: 1,
      producerStockCover: 1,
      producerClearingReferenceStage: 1,
      producerFundedBookStage: 1,
      producerShortageGrowthStage: 1,
      producerCaptiveDeliveryStage: 1,
      producerJointRunStage: 1,
      producerFundedRestartStage: 1,
      fundedHeadcountStage: 1,
      producerTransitionPackageEnabled: false,
    },
  };
}

/** Old-economy cutover marks; a rebuilt economy never had an over-built class. */
const TRANSITION_STAMP_FILTER = {
  $or: [{ cutoverTransition: { $exists: true } }, { cutoverStruggling: { $exists: true } }],
};

export interface ApplyFundedSwitchOptions {
  expectedWorldEpoch: string;
}

export interface ApplyFundedSwitchResult {
  status: "applied" | "alreadyApplied";
  currentTurn: number;
  worldEpoch: string;
  producerMarketLiveFromTurn: number;
  transitionStampsCleared: number;
}

function matches(config: Document | null, set: Record<string, unknown>): boolean {
  if (!config) return false;
  return Object.entries(set).every(([key, value]) => config[key] === value);
}

/**
 * Writes the funded config and clears the transition stamps. Refuses unless the
 * opening conversion is recorded for this world at this turn.
 */
export async function applyFundedSwitch(
  db: Db,
  options: ApplyFundedSwitchOptions
): Promise<ApplyFundedSwitchResult> {
  const state = await db
    .collection<GameState>("gameState")
    .findOne(
      { _id: "current" },
      { projection: { worldEpochId: 1, currentTurn: 1, producerOpening: 1 } }
    );
  if (!state || state.worldEpochId !== options.expectedWorldEpoch)
    throw new Error("The expected world is not the live world");
  const currentTurn = state.currentTurn;
  if (!Number.isSafeInteger(currentTurn) || currentTurn < 0)
    throw new Error("The live world has no whole turn number");
  const opening = state.producerOpening;
  if (!opening)
    throw new Error(
      `The funded switch needs the producer opening at turn ${currentTurn}; no opening is recorded`
    );
  if (opening.worldEpoch !== options.expectedWorldEpoch)
    throw new Error("The producer opening belongs to a different world");
  if (opening.turn !== currentTurn)
    throw new Error(
      `The funded switch needs the producer opening at turn ${currentTurn}; it was applied at turn ${opening.turn}`
    );

  const update = fundedSwitchGameConfigUpdate(currentTurn);
  const set = (update.$set ?? {}) as unknown as Record<string, unknown>;
  const liveFromTurn = set.producerMarketLiveFromTurn as number;
  const config = await db
    .collection<{ _id: string } & Document>("gameConfig")
    .findOne(
      { _id: "default" },
      { projection: Object.fromEntries(Object.keys(set).map((key) => [key, 1])) }
    );
  const transitionStamps = await db
    .collection("corporateSectors")
    .countDocuments(TRANSITION_STAMP_FILTER);
  if (transitionStamps === 0 && matches(config, set))
    return {
      status: "alreadyApplied",
      currentTurn,
      worldEpoch: options.expectedWorldEpoch,
      producerMarketLiveFromTurn: liveFromTurn,
      transitionStampsCleared: 0,
    };

  if (transitionStamps > 0)
    await db.collection("corporateSectors").updateMany(TRANSITION_STAMP_FILTER, {
      $unset: { cutoverTransition: "", cutoverStruggling: "" },
    });
  const written = await db
    .collection<GameConfig>("gameConfig")
    .updateOne({ _id: "default" }, update);
  if (written.matchedCount !== 1)
    throw new Error("The gameConfig document is missing; the funded switch was not written");
  return {
    status: "applied",
    currentTurn,
    worldEpoch: options.expectedWorldEpoch,
    producerMarketLiveFromTurn: liveFromTurn,
    transitionStampsCleared: transitionStamps,
  };
}
