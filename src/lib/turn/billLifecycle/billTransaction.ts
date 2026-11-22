import { billsCollection } from "@/lib/db/repositories/bills";
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
      const committed = (billStatusTransitions.get(result) ?? []).slice(events.length);
      if (committed.length > 0)
        await billsCollection(tx).bulkWrite(
          committed.map((event, index) => ({
            updateOne: {
              filter: { _id: event.bill._id },
              update: {
                $push: {
                  lifecycleReceipts: {
                    turn: event.turn,
                    fromStatus: event.fromStatus,
                    toStatus: event.toStatus,
                    chamber: event.bill.currentChamber ?? event.bill.originChamber,
                    category: event.bill.category,
                    provisionFamily: event.bill.provisions?.[0]?.type,
                    voteMargin: event.bill.votesFor - event.bill.votesAgainst,
                    counters: {
                      billsProcessed:
                        index === 0 ? result.billsProcessed - saved.billsProcessed : 0,
                      billsPassed: index === 0 ? result.billsPassed - saved.billsPassed : 0,
                      billsFailed: index === 0 ? result.billsFailed - saved.billsFailed : 0,
                      billsVetoed: index === 0 ? result.billsVetoed - saved.billsVetoed : 0,
                    },
                    enactedCategories:
                      index === 0
                        ? result.enactedCategories.slice(saved.enactedCategories.length)
                        : [],
                    transitionedTo:
                      index === 0
                        ? Object.fromEntries(
                            Object.entries(result.transitionedTo).map(([key, value]) => [
                              key,
                              value - (saved.transitionedTo[key] ?? 0),
                            ])
                          )
                        : {},
                  },
                },
              },
            },
          }))
        );
    });
  } catch (error) {
    restore();
    throw error;
  }
}
