/** Retry handling for producer funding moves an earlier attempt of the same turn applied. */
import type { Db } from "mongodb";
import { createHash } from "node:crypto";
import {
  applyMoneyMove,
  resumeMoneyMove,
  type MoneyMove,
  type MoneyMoveLeg,
} from "@/lib/banking/moneyMove";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";

type RecordedLeg = Pick<
  MoneyMoveLeg,
  "kind" | "amount" | "valuation" | "collection" | "filter" | "path"
> & { applied?: boolean };
const walletKey = (leg: { collection?: string; filter?: Record<string, unknown>; path?: string }) =>
  `${leg.collection}|${JSON.stringify(leg.filter ?? null)}|${leg.path}`;

/** True when this one-time household opening move already landed for the world. */
export async function householdOpeningAlreadyApplied(db: Db, move: MoneyMove): Promise<boolean> {
  if (move.kind !== "producer_household_opening") return false;
  const original = await bankMoneyMovesCollection<{ _id: string; kind: string; status: string }>(
    db
  ).findOne({ _id: move.key }, { projection: { kind: 1, status: 1 } });
  return original?.status === "applied" && original.kind === move.kind;
}

/**
 * Brings an already-applied mint-and-credit funding batch to the amounts this attempt computed.
 * Only for moves made of mint and credit legs (funding), whose recorded record is applied for
 * the same turn and kind. The difference per wallet against the original record plus every
 * earlier correction is minted and credited, or debited and burned, under a key derived from
 * the target amounts, so the same retry replays and a later retry corrects from the right base.
 * Returns false when the move is not that shape, leaving the caller's rejection in place.
 */
export async function reconcileAppliedFunding(db: Db, move: MoneyMove): Promise<boolean> {
  if (move.turn === undefined || !move.legs.every((l) => l.kind === "mint" || l.kind === "credit"))
    return false;
  const records = bankMoneyMovesCollection<{
    _id: string;
    kind: string;
    turn?: number;
    status: string;
    legs: RecordedLeg[];
  }>(db);
  const original = await records.findOne({ _id: move.key });
  if (
    !original ||
    original.status !== "applied" ||
    original.kind !== move.kind ||
    original.turn !== move.turn
  )
    return false;
  const prefix = `${move.key}:reconcile:`;
  const corrections = await records
    .find({ _id: { $gte: prefix, $lt: `${prefix}\uffff` } })
    .toArray();
  if (corrections.some((c) => c.status !== "applied")) return false;
  const held = new Map<string, number>();
  const add = (leg: RecordedLeg, sign: number) => {
    if (leg.kind !== "credit" && leg.kind !== "debit") return;
    const k = walletKey(leg);
    held.set(k, (held.get(k) ?? 0) + sign * (leg.kind === "credit" ? 1 : -1) * leg.amount);
  };
  for (const leg of original.legs) add(leg, 1);
  for (const c of corrections) for (const leg of c.legs) add(leg, 1);
  const target = new Map<string, MoneyMoveLeg>();
  const want = new Map<string, number>();
  for (const leg of move.legs) {
    if (leg.kind !== "credit") continue;
    const k = walletKey(leg);
    target.set(k, leg);
    want.set(k, (want.get(k) ?? 0) + leg.amount);
  }
  const legs: MoneyMoveLeg[] = [];
  for (const k of new Set([...held.keys(), ...want.keys()])) {
    const delta = (want.get(k) ?? 0) - (held.get(k) ?? 0);
    if (Math.abs(delta) < 1e-6) continue;
    const base =
      target.get(k) ??
      ([...original.legs, ...corrections.flatMap((c) => c.legs)].find(
        (l) => (l.kind === "credit" || l.kind === "debit") && walletKey(l) === k
      ) as MoneyMoveLeg | undefined);
    if (!base?.collection || !base.filter || !base.path) return false;
    const where = { collection: base.collection, filter: base.filter, path: base.path };
    if (delta > 0)
      legs.push(
        {
          kind: "mint",
          amount: delta,
          valuation: base.valuation,
          note: "retry correction: funding raised to this attempt's amount",
        } as MoneyMoveLeg,
        {
          kind: "credit",
          amount: delta,
          valuation: base.valuation,
          ...where,
          note: "retry correction",
        } as MoneyMoveLeg
      );
    else
      legs.push(
        {
          kind: "debit",
          amount: -delta,
          valuation: base.valuation,
          ...where,
          note: "retry correction",
        } as MoneyMoveLeg,
        {
          kind: "burn",
          amount: -delta,
          valuation: base.valuation,
          note: "retry correction: funding lowered to this attempt's amount",
        } as MoneyMoveLeg
      );
  }
  if (legs.length === 0) return true;
  const digest = createHash("sha256")
    .update(JSON.stringify([...want.entries()].sort()))
    .digest("hex")
    .slice(0, 16);
  const correction: MoneyMove = {
    key: `${prefix}${digest}`,
    kind: `${move.kind}_retry_correction`,
    turn: move.turn,
    legs,
    record: { batchIndependentDebits: true, correctsKey: move.key },
  };
  let result = await applyMoneyMove(db, correction);
  if (result.status === "replayed") result = await resumeMoneyMove(db, correction.key);
  return result.status === "applied" || result.status === "replayed";
}
