/**
 * Outbox reads and completion for population orders raised by Crisis v2 effects.
 * Kept apart from the writer so the conflict materializers can complete them
 * without importing the writer's dependencies.
 */
import { ObjectId, type AnyBulkWriteOperation, type Db } from "mongodb";
import type { Crisis } from "@/lib/db/types/crisis";
import type { ConflictCivilianLossOrder } from "./rules/civilianLoss";
import type { RefugeeReceptionOrder } from "./rules/refugeeReception";
import { crisesCollection } from "@/lib/db/repositories/crises";

/** Orders from live and just-closed crises whose effective turn has arrived. */
export async function loadPendingCrisisPopulationOrders(
  db: Db,
  worldEpochId: string,
  turn: number
): Promise<{ civilianLoss: ConflictCivilianLossOrder[]; reception: RefugeeReceptionOrder[] }> {
  const rows = await crisesCollection(db)
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
  const ops: AnyBulkWriteOperation<Crisis>[] = [
    ...done.civilianLoss.map((order): AnyBulkWriteOperation<Crisis> => ({
      updateOne: {
        filter: { _id: new ObjectId(order.crisisId) },
        update: { $set: { "populationOrders.civilianLoss.$[order].status": "complete" } },
        arrayFilters: [{ "order._id": order._id }],
      },
    })),
    ...done.reception.map((order): AnyBulkWriteOperation<Crisis> => ({
      updateOne: {
        filter: { _id: new ObjectId(order.crisisId) },
        update: { $set: { "populationOrders.reception.$[order].status": "complete" } },
        arrayFilters: [{ "order._id": order._id }],
      },
    })),
  ];
  if (ops.length === 0) return;
  const crises = crisesCollection(db);
  await crises.bulkWrite(ops, { ordered: true });
  const touched = new Set([...done.civilianLoss, ...done.reception].map((order) => order.crisisId));
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
