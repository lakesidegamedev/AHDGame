/**
 * Outbox reads and completion for population orders raised by Crisis v2 effects.
 * Kept apart from the writer so the conflict materializers can complete them
 * without importing the writer's dependencies.
 */
import { ObjectId, type Db } from "mongodb";
import type { Crisis } from "@/lib/db/types/crisis";
import type { ConflictCivilianLossOrder } from "./rules/civilianLoss";
import type { RefugeeReceptionOrder } from "./rules/refugeeReception";

/** Orders from live and just-closed crises whose effective turn has arrived. */
export async function loadPendingCrisisPopulationOrders(
  db: Db,
  worldEpochId: string,
  turn: number
): Promise<{ civilianLoss: ConflictCivilianLossOrder[]; reception: RefugeeReceptionOrder[] }> {
  const rows = await db
    .collection<Crisis>("crises")
    .find(
      { "populationOrders.epochId": worldEpochId, "populationOrders.pending": true },
      { projection: { populationOrders: 1 } }
    )
    .limit(2001)
    .toArray();
  if (rows.length > 2000)
    throw new Error("Crisis population order backlog exceeds the safe batch limit");
  const civilianLoss: ConflictCivilianLossOrder[] = [];
  const reception: RefugeeReceptionOrder[] = [];
  for (const row of rows) {
    for (const order of row.populationOrders?.civilianLoss ?? []) {
      if (order.status === "pending" && order.effectiveTurn <= turn) civilianLoss.push(order);
    }
    for (const order of row.populationOrders?.reception ?? []) {
      if (order.status === "pending" && order.effectiveTurn <= turn) reception.push(order);
    }
  }
  return { civilianLoss, reception };
}

/** Marks orders complete once their results are recorded in the flow receipt. */
export async function completeCrisisPopulationOrders(
  db: Db,
  done: {
    civilianLoss: readonly { _id: string; crisisId: string }[];
    reception: readonly { _id: string; crisisId: string }[];
  }
): Promise<void> {
  const crises = db.collection<Crisis>("crises");
  const touched = new Set<string>();
  for (const order of done.civilianLoss) {
    await crises.updateOne(
      { _id: new ObjectId(order.crisisId) },
      { $set: { "populationOrders.civilianLoss.$[order].status": "complete" } },
      { arrayFilters: [{ "order._id": order._id }] }
    );
    touched.add(order.crisisId);
  }
  for (const order of done.reception) {
    await crises.updateOne(
      { _id: new ObjectId(order.crisisId) },
      { $set: { "populationOrders.reception.$[order].status": "complete" } },
      { arrayFilters: [{ "order._id": order._id }] }
    );
    touched.add(order.crisisId);
  }
  if (touched.size === 0) return;
  await crises.updateMany(
    {
      _id: { $in: [...touched].map((id) => new ObjectId(id)) },
      "populationOrders.pending": true,
      "populationOrders.civilianLoss": { $not: { $elemMatch: { status: "pending" } } },
      "populationOrders.reception": { $not: { $elemMatch: { status: "pending" } } },
    },
    { $set: { "populationOrders.pending": false } }
  );
}
