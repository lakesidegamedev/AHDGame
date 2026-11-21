import type { Db, Document } from "mongodb";
import type { Migration, MigrationContext, MigrationResult } from "../types";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { resolveBuildSettledTurn } from "@/lib/corporations/buildDelivery";
import { steppedDeliveredFraction } from "@/lib/corporations/wholePlants/rules";

/**
 * Build orders deliver linearly now. Orders already under construction were
 * delivering in whole-plant steps (or all at once), so part of their ordered
 * capacity has landed under the old curve. Re-anchoring each one to the last
 * settled turn, with the share already delivered recorded as its base, makes
 * the rest ramp in a slice every turn without delivering anything twice and
 * without moving any money.
 */

interface OrderLike extends Document {
  unitsOrdered?: number;
  startTurn?: number;
  onlineTurn?: number;
  smooth?: boolean;
  plantUnits?: number;
  deliveryBaseFraction?: number;
}

/** The share the previous delivery curve had landed by `turn`. */
export function previousDeliveredFraction(order: OrderLike, turn: number): number {
  const start = order.startTurn ?? 0;
  const online = order.onlineTurn ?? 0;
  const window = online - start;
  if (order.smooth !== true || !(window > 0)) return turn >= online ? 1 : 0;
  const f = (turn - start) / window;
  const linear = f <= 0 ? 0 : f >= 1 ? 1 : f;
  return order.plantUnits != null && order.plantUnits > 0 && (order.unitsOrdered ?? 0) > 0
    ? steppedDeliveredFraction(linear, order.unitsOrdered as number, order.plantUnits)
    : linear;
}

/** The re-anchored order fields, or null when the order needs no change. */
export function reanchoredOrder(
  order: OrderLike,
  settledTurn: number
): { startTurn: number; deliveryBaseFraction: number } | null {
  if (order.deliveryBaseFraction != null) return null;
  if (!(typeof order.onlineTurn === "number" && order.onlineTurn > settledTurn)) return null;
  // A smooth order without whole-plant steps already ramps linearly.
  if (order.smooth === true && !(order.plantUnits != null && order.plantUnits > 0)) return null;
  // An order placed after the settled turn has delivered nothing and keeps its own start.
  const anchor = Math.max(order.startTurn ?? settledTurn, settledTurn);
  if (!(anchor < order.onlineTurn)) return null;
  const base = previousDeliveredFraction(order, anchor);
  return { startTurn: anchor, deliveryBaseFraction: Math.min(1, Math.max(0, base)) };
}

async function run(db: Db, ctx: MigrationContext): Promise<MigrationResult> {
  const gs = await gameStateCollection<{
    _id: string;
    currentTurn?: number;
    buildDeliverySettledTurn?: number;
  }>(db).findOne(
    { _id: "current" },
    { projection: { currentTurn: 1, buildDeliverySettledTurn: 1 } }
  );
  const currentTurn = gs?.currentTurn;
  if (typeof currentTurn !== "number" || !Number.isFinite(currentTurn)) {
    throw new Error("linear-build-delivery: gameState.currentTurn is missing or not a number");
  }

  const sectors = corporateSectorsCollection<Document>(db);
  const filter = {
    buildQueue: {
      $elemMatch: { onlineTurn: { $gt: currentTurn - 1 }, deliveryBaseFraction: null },
    },
  };
  const cursor = sectors.find(filter, {
    projection: { buildQueue: 1, buildDeliverySettledTurn: 1 },
  });

  let scanned = 0;
  let updated = 0;
  const ops: Document[] = [];
  for await (const sector of cursor) {
    scanned += 1;
    const settled = resolveBuildSettledTurn(
      currentTurn,
      sector.buildDeliverySettledTurn,
      gs?.buildDeliverySettledTurn
    );
    const queue: OrderLike[] = Array.isArray(sector.buildQueue) ? sector.buildQueue : [];
    const set: Document = {};
    queue.forEach((order, i) => {
      const next = reanchoredOrder(order, settled);
      if (!next) return;
      set[`buildQueue.${i}.startTurn`] = next.startTurn;
      set[`buildQueue.${i}.deliveryBaseFraction`] = next.deliveryBaseFraction;
      set[`buildQueue.${i}.smooth`] = true;
    });
    if (Object.keys(set).length === 0) continue;
    updated += 1;
    // Guard on the queue length so a concurrent edit cannot land on a shifted index.
    ops.push({
      updateOne: {
        filter: { _id: sector._id, buildQueue: { $size: queue.length } },
        update: { $set: set },
      },
    });
  }

  if (ctx.dryRun) {
    return {
      documentsScanned: scanned,
      notes: [`dry run: would re-anchor in-flight build orders in ${updated} sectors`],
    };
  }
  if (ops.length > 0) await sectors.bulkWrite(ops as never, { ordered: false });
  return {
    documentsScanned: scanned,
    documentsUpdated: updated,
    notes: ["re-anchored in-flight build orders to linear delivery from the last settled turn"],
  };
}

export const migration: Migration = {
  id: "2026-11-17-linear-build-delivery",
  description:
    "Re-anchor in-flight plant build orders so the remaining capacity ramps in linearly every turn, crediting what the old step curve already delivered.",
  idempotent: true,
  execute: run,
};
