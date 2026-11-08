import type { Db, Document, Filter } from "mongodb";
import type { GovernorExecutiveOrder, LegislationType, StatePolicy } from "@/lib/db/types";
import type { Migration, MigrationResult } from "../types";
import { ladderBounds } from "@/lib/legislature/policyLadder";
import { policyFieldsFromOption } from "@/lib/governorOffice/orders/revertPolicy";

/**
 * Clamp policy levels that exceed their legislation type's ladder.
 *
 * Orders assumed the seven-option (0-6) ladder, but five-level types (0-4)
 * exist, so an order can settle on index 5 with no option behind it. Readers
 * coerce that to 4, so stored data and mechanics disagree; clamping to the
 * ladder top is the value the game already behaves as.
 *
 * Only clamps DOWN, and only when genuinely out of range, so valid revert
 * targets survive untouched. Unknown ladder lengths are skipped, not guessed.
 */
interface Repair {
  collection: "statePolicies" | "governorExecutiveOrders";
  filter: Filter<Document>;
  set: Record<string, number | string>;
  label: string;
}

async function repairOutOfRangePolicyLevels(db: Db, dryRun: boolean): Promise<MigrationResult> {
  const policies = (await db
    .collection<StatePolicy>("statePolicies")
    .find({ policyOptionIndex: { $exists: true } })
    .toArray()) as StatePolicy[];
  const orders = (await db
    .collection<GovernorExecutiveOrder>("governorExecutiveOrders")
    .find({})
    .toArray()) as GovernorExecutiveOrder[];

  const referencedIds = [
    ...new Set([
      ...policies.map((p) => p.legislationTypeId),
      ...orders.map((o) => o.legislationTypeId),
    ]),
  ];
  const types = (await db
    .collection<LegislationType>("legislationTypes")
    .find({ _id: { $in: referencedIds } })
    .toArray()) as LegislationType[];
  const optionsById = new Map(types.map((t) => [String(t._id), t.policyOptions ?? []]));

  /** Ladder top for a type, or null when its option count is unknown. */
  function maxIndexFor(legislationTypeId: string): number | null {
    const options = optionsById.get(legislationTypeId);
    if (!options || options.length === 0) return null;
    return ladderBounds(options.length).maxIndex;
  }

  const repairs: Repair[] = [];

  for (const policy of policies) {
    if (policy._id == null) continue;
    const max = maxIndexFor(policy.legislationTypeId);
    if (max === null) continue;
    const index = policy.policyOptionIndex;
    if (typeof index !== "number" || index <= max) continue;
    // Rewrite the whole option, not just the index. The order that wrote this
    // row could not find an option at its out-of-range index, so it fell back
    // to the PRIOR policy's economic/social/effectDirection — leaving axis
    // values that describe a different option than the index does. Consumers
    // that resolve an option by (economic, social) — the State Policy page
    // among them — would still name the wrong one. `policyFieldsFromOption` is
    // the same helper the order-revert path uses.
    const option = optionsById.get(policy.legislationTypeId)?.[max];
    if (!option) continue;
    repairs.push({
      collection: "statePolicies",
      filter: { _id: policy._id },
      set: { ...policyFieldsFromOption(option, max) },
      label: `statePolicies ${policy.stateId}/${policy.legislationTypeId} ${index}->${max}`,
    });
  }

  for (const order of orders) {
    if (order._id == null) continue;
    const max = maxIndexFor(order.legislationTypeId);
    if (max === null) continue;
    const set: Record<string, number> = {};
    if (typeof order.policyOptionIndexAfter === "number" && order.policyOptionIndexAfter > max) {
      set.policyOptionIndexAfter = max;
    }
    if (typeof order.policyOptionIndexBefore === "number" && order.policyOptionIndexBefore > max) {
      set.policyOptionIndexBefore = max;
    }
    if (Object.keys(set).length === 0) continue;
    repairs.push({
      collection: "governorExecutiveOrders",
      filter: { _id: order._id },
      set,
      label: `order ${order.stateId}/${order.legislationTypeId} ${JSON.stringify(set)}`,
    });
  }

  const policyRepairs = repairs.filter((r) => r.collection === "statePolicies").length;
  const orderRepairs = repairs.length - policyRepairs;
  const notes = [
    `${dryRun ? "would repair" : "repaired"} ${policyRepairs} policy row(s) and ${orderRepairs} order(s)`,
    ...repairs.map((r) => r.label),
  ];

  if (dryRun || repairs.length === 0) {
    return {
      documentsScanned: policies.length + orders.length,
      documentsUpdated: 0,
      notes,
    };
  }

  for (const repair of repairs) {
    await db.collection(repair.collection).updateOne(repair.filter, { $set: repair.set });
  }

  return {
    documentsScanned: policies.length + orders.length,
    documentsUpdated: repairs.length,
    notes,
  };
}

export const migration: Migration = {
  id: "2026-08-26-repair-out-of-range-policy-levels",
  description:
    "Ticket #1189: clamp statePolicies and executive-order levels that the old hardcoded 0-6 order ladder pushed past the end of a shorter (usually five-level) policy list.",
  // Clamps only out-of-range values down to the ladder top; a second pass
  // finds nothing left to clamp.
  idempotent: true,
  execute: (db, ctx) => repairOutOfRangePolicyLevels(db, ctx.dryRun),
};
