import type { AnyBulkWriteOperation, Db } from "mongodb";
import type { GovernorExecutiveOrder, StatePolicy } from "@/lib/db/types";
import { withSessionDb } from "@/lib/db/sessionDb";
import { buildOrderRevertPolicyFields } from "@/lib/governorOffice/orders/revertPolicy";
import { legislationTypesCollection } from "@/lib/db/repositories/legislationTypes";
import { statePoliciesCollection } from "@/lib/db/repositories/statePolicies";
import { governorExecutiveOrdersCollection } from "@/lib/db/repositories/governorExecutiveOrders";

/** Policy restoration and order completion must publish together after bill enactment. */
export async function processGovernorExecutiveOrders(
  db: Db,
  currentTurn: number
): Promise<{ expired: number; superseded: number }> {
  return withSessionDb(db, async (db) => {
    const active = await governorExecutiveOrdersCollection(db).find({ status: "active" }).toArray();
    if (!active.length) return { expired: 0, superseded: 0 };
    const [policies, types] = await Promise.all([
      statePoliciesCollection(db)
        .find({
          $or: active.map((order) => ({
            stateId: order.stateId,
            legislationTypeId: order.legislationTypeId,
            $or: [{ countryId: order.countryId.toUpperCase() }, { countryId: { $exists: false } }],
          })),
        })
        .toArray(),
      legislationTypesCollection(db)
        .find(
          { _id: { $in: [...new Set(active.map((order) => order.legislationTypeId))] } },
          { projection: { policyOptions: 1 } }
        )
        .toArray(),
    ]);
    const typeById = new Map(types.map((type) => [type._id, type]));
    const policyKey = (country: string, state: string, type: string) =>
      `${country.toUpperCase()}:${state}:${type}`;
    const policyByKey = new Map(
      policies.map((policy) => [
        policyKey(policy.countryId ?? "", policy.stateId, policy.legislationTypeId),
        policy,
      ])
    );
    const policyOps: AnyBulkWriteOperation<StatePolicy>[] = [];
    const orderOps: AnyBulkWriteOperation<GovernorExecutiveOrder>[] = [];
    let expired = 0,
      superseded = 0;
    const now = new Date();
    for (const order of active) {
      if (!order._id) continue;
      const policy =
        policyByKey.get(policyKey(order.countryId, order.stateId, order.legislationTypeId)) ??
        policyByKey.get(policyKey("", order.stateId, order.legislationTypeId));
      const matches =
        policy?.enactedBy?.kind === "order" && String(policy.enactedBy.id) === String(order._id);
      if (!matches) {
        orderOps.push({
          updateOne: {
            filter: { _id: order._id, status: "active" },
            update: {
              $set: {
                status: "superseded",
                ...(policy?.enactedBy?.kind === "bill"
                  ? { supersededByBillId: policy.enactedBy.id }
                  : {}),
                updatedAt: now,
              },
            },
          },
        });
        superseded++;
      } else if (currentTurn >= order.expiresAtTurn) {
        policyOps.push({
          updateOne: {
            filter: { _id: policy!._id, "enactedBy.kind": "order", "enactedBy.id": order._id },
            update: {
              $set: buildOrderRevertPolicyFields(
                order,
                typeById.get(order.legislationTypeId) ?? null,
                currentTurn
              ),
            },
          },
        });
        orderOps.push({
          updateOne: {
            filter: { _id: order._id, status: "active" },
            update: { $set: { status: "expired", updatedAt: now } },
          },
        });
        expired++;
      }
    }
    if (policyOps.length) {
      const result = await statePoliciesCollection(db).bulkWrite(policyOps);
      if (result.matchedCount !== policyOps.length)
        throw new Error("Executive order policies changed during expiry");
    }
    if (orderOps.length) {
      const result = await governorExecutiveOrdersCollection(db).bulkWrite(orderOps);
      if (result.matchedCount !== orderOps.length)
        throw new Error("Executive orders changed during expiry");
    }
    return { expired, superseded };
  });
}
