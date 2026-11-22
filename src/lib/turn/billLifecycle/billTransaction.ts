import type { Db } from "mongodb";
import type { Bill } from "@/lib/db/types";
import { withSessionDb } from "@/lib/db/sessionDb";
import type { BillLifecycleResult } from "./engine";

export type BillStatusTransition = {
  bill: Bill;
  fromStatus: string;
  toStatus: string;
  turn: number;
};
export const billStatusTransitions = new WeakMap<BillLifecycleResult, BillStatusTransition[]>();

/** Keep one bill's state transition and effects atomic without holding the entire docket open. */
export async function withBillTransaction(
  db: Db,
  result: BillLifecycleResult,
  work: (tx: Db) => Promise<void>
): Promise<void> {
  const saved = {
    ...result,
    enactedCategories: [...result.enactedCategories],
    transitionedTo: { ...result.transitionedTo },
  };
  const events = [...(billStatusTransitions.get(result) ?? [])];
  const restore = () => {
    Object.assign(result, saved, {
      enactedCategories: [...saved.enactedCategories],
      transitionedTo: { ...saved.transitionedTo },
    });
    billStatusTransitions.set(result, [...events]);
  };
  try {
    await withSessionDb(db, async (tx) => {
      restore();
      await work(tx);
    });
  } catch (error) {
    restore();
    throw error;
  }
}
