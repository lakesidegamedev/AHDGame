/**
 * Owner answers to an NPP CEO's pay demand: accept, counter or replace.
 * The rules live in corporations/rules/nppCeoCareer; replacement reuses the
 * turn pass's replaceCeos so both paths seat a CEO the same way.
 */
import type { AnyBulkWriteOperation, Db } from "mongodb";
import { ObjectId } from "mongodb";
import { z } from "zod";
import type { Corporation, CorporationCeoPay } from "@/lib/db/types/corporation";
import type { NPP } from "@/lib/db/types/npp";
import {
  CEO_PAY_REVIEW_TURNS,
  resolveCeoPayResponse,
  type CeoPayResponse,
} from "@/lib/corporations/rules/nppCeoCareer";
import {
  isNppCeoPayCorp,
  replaceCeos,
  trailingDailyResults,
} from "@/lib/turn/corporation/nppCeoPay";

export const ceoPayResponseSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("counter"), amount: z.number().finite().min(0) }),
  z.object({ action: z.literal("replace") }),
]);

export type CeoPayCommandResult =
  | { ok: true; outcome: "accepted" | "countered" | "replaced" | "noReplacement"; salary?: number }
  | { ok: false; status: 400 | 409; error: string };

export async function respondToCeoPayDemand(
  db: Db,
  corporation: Corporation,
  response: CeoPayResponse,
  turn: number,
  now: Date = new Date()
): Promise<CeoPayCommandResult> {
  const demand = corporation.ceoPay?.demand;
  if (!isNppCeoPayCorp(corporation) || !demand) {
    return { ok: false, status: 400, error: "There is no open pay demand to answer." };
  }
  const npp = await db
    .collection<NPP>("npps")
    .findOne({ _id: corporation.ceoId as ObjectId }, { projection: { personality: 1 } });
  const outcome = resolveCeoPayResponse(
    demand.amount,
    response,
    npp?.personality?.stubbornness ?? 50
  );
  // Every write is conditional on the same open demand, so a turn pass or a
  // second click that resolved it first wins and this one reports a conflict.
  const openDemand = { _id: corporation._id, "ceoPay.demand.turn": demand.turn };

  if (outcome.kind === "salary") {
    const pay: CorporationCeoPay = {
      ceoId: corporation.ceoPay!.ceoId,
      appointedTurn: corporation.ceoPay!.appointedTurn,
      nextReviewTurn: turn + CEO_PAY_REVIEW_TURNS,
      level: demand.level,
      lastDecision: {
        turn,
        outcome: outcome.accepted === "demand" ? "accepted" : "countered",
        salary: outcome.salary,
        bySystem: false,
      },
    };
    const result = await db
      .collection<Corporation>("corporations")
      .updateOne(openDemand, { $set: { ceoSalary: outcome.salary, ceoPay: pay, updatedAt: now } });
    if (result.modifiedCount !== 1) {
      return { ok: false, status: 409, error: "The demand was already answered. Refresh." };
    }
    return {
      ok: true,
      outcome: outcome.accepted === "demand" ? "accepted" : "countered",
      salary: outcome.salary,
    };
  }

  const claim = await db
    .collection<Corporation>("corporations")
    .updateOne(openDemand, { $set: { "ceoPay.demand.expiresTurn": turn } });
  if (claim.modifiedCount !== 1) {
    return { ok: false, status: 409, error: "The demand was already answered. Refresh." };
  }
  const trailing = await trailingDailyResults(db, [corporation._id], turn);
  const ops: AnyBulkWriteOperation<Corporation>[] = [];
  const replaced = await replaceCeos(
    db,
    [corporation],
    turn,
    now,
    ops,
    false,
    (corp) => trailing.get(corp._id.toString())?.revenue ?? 0
  );
  if (ops.length > 0) await db.collection<Corporation>("corporations").bulkWrite(ops);
  return replaced > 0 ? { ok: true, outcome: "replaced" } : { ok: true, outcome: "noReplacement" };
}

/** Plain view of the CEO career for the company page. */
export function ceoPayView(corporation: Corporation) {
  const pay = corporation.ceoPay;
  if (!isNppCeoPayCorp(corporation) || !pay) return null;
  return {
    /** Amounts below are in this currency, per day. */
    currencyCode: corporation.liquidCurrencyCode ?? "USD",
    salary: corporation.ceoSalary ?? 0,
    nextReviewTurn: pay.nextReviewTurn,
    level: pay.level ?? null,
    demand: pay.demand ?? null,
    lastDecision: pay.lastDecision ?? null,
  };
}
