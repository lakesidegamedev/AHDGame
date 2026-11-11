import type { Db } from "mongodb";
import type { Migration, MigrationContext, MigrationResult } from "../types";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

/**
 * Make already-placed plant build orders deliver progressively.
 *
 * Delivery is a stateless ramp from `startTurn`, so flipping `smooth` on a
 * part-way order would deliver only the remaining fraction and silently lose
 * already-paid capacity. Re-anchoring `startTurn` to now ramps the FULL
 * `unitsOrdered` over the remaining window while still finishing on the
 * original `onlineTurn`. `costPaidAnchor` is never modified, so no money moves.
 *
 * Only touches orders still under construction and not already smooth.
 * Reads the world's live `currentTurn`, so it is correct whenever and wherever
 * it runs.
 */
async function run(db: Db, ctx: MigrationContext): Promise<MigrationResult> {
  // Keyed by the string "current"; see the note in the 1953 heal migration.
  const gs = await gameStateCollection<{ _id: string; currentTurn?: number }>(db).findOne(
    { _id: "current" },
    { projection: { currentTurn: 1 } }
  );
  const currentTurn = gs?.currentTurn;
  if (typeof currentTurn !== "number" || !Number.isFinite(currentTurn)) {
    throw new Error("smooth-legacy-build-orders: gameState.currentTurn is missing or not a number");
  }

  const sectors = db.collection("corporateSectors");
  // A sector holding at least one grandfathered (non-smooth) order still under
  // construction. `$ne: true` matches both "smooth absent" and "smooth false".
  const filter = {
    buildQueue: { $elemMatch: { smooth: { $ne: true }, onlineTurn: { $gt: currentTurn } } },
  } as const;

  const matched = await sectors.countDocuments(filter);

  if (ctx.dryRun) {
    return {
      documentsScanned: matched,
      notes: [
        `dry run: would smooth legacy in-flight build orders in ${matched} sectors at turn ${currentTurn}`,
      ],
    };
  }

  const res = await sectors.updateMany(
    filter,
    {
      $set: {
        // Positional-all-matching update: only the elements the arrayFilter
        // selects (legacy + still building) are rewritten; already-smooth and
        // already-landed orders in the same queue are untouched.
        "buildQueue.$[o].smooth": true,
        "buildQueue.$[o].startTurn": currentTurn,
      },
    },
    {
      arrayFilters: [{ "o.smooth": { $ne: true }, "o.onlineTurn": { $gt: currentTurn } }],
    }
  );

  return {
    documentsScanned: matched,
    documentsUpdated: res.modifiedCount,
    notes: [`smoothed legacy in-flight build orders, re-anchored startTurn to turn ${currentTurn}`],
  };
}

export const migration: Migration = {
  id: "2026-08-10-smooth-legacy-build-orders",
  description:
    "Convert grandfathered (pre-smooth) in-flight plant build orders to progressive per-turn delivery, re-anchoring startTurn to the current turn so full ordered capacity is delivered over the remaining window.",
  idempotent: true,
  execute: run,
};
