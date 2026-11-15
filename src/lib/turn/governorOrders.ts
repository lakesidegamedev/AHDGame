import type { Db } from "mongodb";
import type { GovernorExecutiveOrder, LegislationType, StatePolicy } from "@/lib/db/types";
import { buildOrderRevertPolicyFields } from "@/lib/governorOffice/orders/revertPolicy";
import { legislationTypesCollection } from "@/lib/db/repositories/legislationTypes";
import { statePoliciesCollection } from "@/lib/db/repositories/statePolicies";
import { governorExecutiveOrdersCollection } from "@/lib/db/repositories/governorExecutiveOrders";

/**
 * Turn phase: process active executive orders.
 * - If the StatePolicy no longer points at this order (a bill superseded it),
 *   mark the order as superseded. Don't touch the policy.
 * - If currentTurn >= expiresAtTurn AND the policy still points at this order,
 *   revert the policy to the snapshot and mark the order as expired.
 *
 * Must run AFTER processBillEnactment so any same-turn bill that overwrote the
 * policy is observed here and wins.
 */
export async function processGovernorExecutiveOrders(
  db: Db,
  currentTurn: number
): Promise<{ expired: number; superseded: number }> {
  const active = await governorExecutiveOrdersCollection(db).find({ status: "active" }).toArray();
  const now = new Date();
  let expired = 0;
  let superseded = 0;

  for (const order of active) {
    if (!order._id) continue;
    const policy = await statePoliciesCollection(db).findOne({
      stateId: order.stateId,
      legislationTypeId: order.legislationTypeId,
    });
    const policyMatchesOrder =
      policy?.enactedBy?.kind === "order" &&
      policy.enactedBy.id.toString() === order._id.toString();

    if (!policyMatchesOrder) {
      const supersedingBillId =
        policy?.enactedBy?.kind === "bill" ? policy.enactedBy.id : undefined;
      await governorExecutiveOrdersCollection(db).updateOne(
        { _id: order._id },
        {
          $set: {
            status: "superseded",
            ...(supersedingBillId ? { supersededByBillId: supersedingBillId } : {}),
            updatedAt: now,
          },
        }
      );
      superseded++;
      continue;
    }

    if (currentTurn >= order.expiresAtTurn) {
      // effectDirection from the type's own ladder — 5-level new-generation
      // ladders center at 2; the old hardcoded center-3 misdirects them
      // (political-legislation spec §10 option-count sweep).
      const legislationType = await legislationTypesCollection(db).findOne(
        { _id: order.legislationTypeId },
        { projection: { policyOptions: 1 } }
      );
      await statePoliciesCollection(db).updateOne(
        { stateId: order.stateId, legislationTypeId: order.legislationTypeId },
        {
          $set: {
            ...buildOrderRevertPolicyFields(order, legislationType, currentTurn),
          },
        }
      );
      await governorExecutiveOrdersCollection(db).updateOne(
        { _id: order._id },
        { $set: { status: "expired", updatedAt: now } }
      );
      expired++;
    }
  }

  return { expired, superseded };
}
