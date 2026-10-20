/**
 * Which producer path a turn runs: the legacy engine or the funded market.
 *
 * One config field switches the world at a turn boundary
 * (`gameConfig.producerMarketLiveFromTurn`). The switch is one-way: once any
 * funded turn has been recorded for a world, every later turn is funded and a
 * config that disagrees is an error, never a quiet return to legacy cash.
 * Each turn also claims its path once, so no turn can run both.
 */
import type { Db } from "mongodb";

export type ProducerPath = "legacy" | "funded";

export interface ProducerOpeningMarker {
  worldEpoch: string;
  /** Last legacy turn; the opening conversion was applied at its end. */
  turn: number;
  digest: string;
}

export interface ProducerPathInput {
  turn: number;
  worldEpoch: string | null | undefined;
  liveFromTurn: number | null | undefined;
  opening: ProducerOpeningMarker | null | undefined;
  /** A funded producer turn already exists for this world. */
  latched: boolean;
}

export function resolveProducerPath(input: ProducerPathInput): ProducerPath {
  const configured =
    typeof input.liveFromTurn === "number" && Number.isSafeInteger(input.liveFromTurn)
      ? input.liveFromTurn
      : null;
  if (input.latched) {
    if (configured == null || input.turn < configured)
      throw new Error(
        "Funded producer market already ran for this world; it cannot return to legacy"
      );
    return "funded";
  }
  if (configured == null || input.turn < configured) return "legacy";
  if (!input.worldEpoch) throw new Error("Funded producer market requires a world epoch");
  const o = input.opening;
  if (!o || o.worldEpoch !== input.worldEpoch || o.turn !== configured - 1 || !o.digest)
    throw new Error(
      `Funded producer market from turn ${configured} requires the opening conversion at turn ${configured - 1}`
    );
  return "funded";
}

export const PRODUCER_PATH_CLAIMS = "producerPathClaims";

/** Reads the config, opening marker and latch, then resolves. */
export async function loadProducerPath(
  db: Db,
  input: { turn: number; worldEpoch: string | null | undefined; liveFromTurn: unknown }
): Promise<ProducerPath> {
  const [state, latch] = await Promise.all([
    db
      .collection<{ _id: string; producerOpening?: ProducerOpeningMarker }>("gameState")
      .findOne({ _id: "current" }, { projection: { producerOpening: 1 } }),
    input.worldEpoch
      ? db
          .collection("producerEconomyTurns")
          .findOne({ worldEpoch: input.worldEpoch }, { projection: { _id: 1 } })
      : null,
  ]);
  return resolveProducerPath({
    turn: input.turn,
    worldEpoch: input.worldEpoch,
    liveFromTurn: typeof input.liveFromTurn === "number" ? input.liveFromTurn : null,
    opening: state?.producerOpening ?? null,
    latched: latch != null,
  });
}

/**
 * Records the path a turn runs. A retry of the same turn with the same path is
 * fine; a second, different path for the same turn throws.
 */
export async function claimProducerPath(
  db: Db,
  input: { worldEpoch: string; turn: number; path: ProducerPath; phase: string }
): Promise<void> {
  const _id = JSON.stringify([input.worldEpoch, input.turn]);
  const claims = db.collection<{
    _id: string;
    worldEpoch: string;
    turn: number;
    path: ProducerPath;
  }>(PRODUCER_PATH_CLAIMS);
  await claims.updateOne(
    { _id },
    { $setOnInsert: { _id, worldEpoch: input.worldEpoch, turn: input.turn, path: input.path } },
    { upsert: true }
  );
  const claim = await claims.findOne({ _id });
  if (claim?.path !== input.path)
    throw new Error(
      `Turn ${input.turn} already runs the ${claim?.path} producer path; ${input.phase} asked for ${input.path}`
    );
}

/** The legacy price phase refuses a turn the funded market claimed. */
export async function assertLegacyProducerPathClaim(
  db: Db,
  worldEpoch: string | null | undefined,
  turn: number
): Promise<void> {
  if (!worldEpoch) return;
  const claim = await db
    .collection<{ _id: string; path: ProducerPath }>(PRODUCER_PATH_CLAIMS)
    .findOne({ _id: JSON.stringify([worldEpoch, turn]) });
  if (claim?.path === "funded")
    throw new Error(`Turn ${turn} settled on the funded producer market; legacy prices refused`);
}
