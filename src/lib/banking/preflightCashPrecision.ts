import { moneyMoveTargetsCollection } from "@/lib/db/repositories/moneyMoveTargets";
import { ObjectId, type Db, type Document } from "mongodb";
import type { MoneyMoveLeg } from "./moneyMove";
import { cashDeltaIsRepresented } from "./rules/representedCashDelta";

type CashTarget = Document & { _id: string | number | ObjectId };
interface CashGroup {
  ids: Map<string, string | number | ObjectId>;
  paths: Set<string>;
  legs: MoneyMoveLeg[];
}

const idKey = (id: unknown) => `${typeof id}:${String(id)}`;
function balanceAt(row: Document, path: string): number {
  const value = path
    .split(".")
    .reduce<unknown>(
      (value, part) => (value && typeof value === "object" ? (value as Document)[part] : undefined),
      row
    );
  return value == null ? 0 : typeof value === "number" ? value : NaN;
}

/** Batch only balance fields; never repeat an expression for every payout recipient. */
export async function preflightCashPrecision(
  db: Db,
  legs: readonly MoneyMoveLeg[]
): Promise<boolean> {
  const groups = new Map<string, CashGroup>();
  for (const leg of legs) {
    if (
      (leg.kind !== "debit" && leg.kind !== "credit") ||
      !leg.amount ||
      !leg.collection ||
      !leg.path ||
      leg.filter?._id === undefined
    )
      continue;
    const id = leg.filter._id;
    if (typeof id !== "string" && typeof id !== "number" && !(id instanceof ObjectId)) continue;
    const group: CashGroup = groups.get(leg.collection) ?? {
      ids: new Map(),
      paths: new Set(),
      legs: [],
    };
    group.ids.set(idKey(id), id);
    group.paths.add(leg.path);
    group.legs.push(leg);
    groups.set(leg.collection, group);
  }
  const results = await Promise.all(
    [...groups].map(([name, group]) => checkCollectionCash(db, name, group))
  );
  return results.every(Boolean);
}

/** One projected query for a collection cohort, independent of its recipient count. */
async function checkCollectionCash(db: Db, name: string, group: CashGroup): Promise<boolean> {
  const paths = [...group.paths].filter(
    (path) => ![...group.paths].some((parent) => path.startsWith(`${parent}.`))
  );
  const rows = await moneyMoveTargetsCollection<CashTarget>(db, name)
    .find(
      { _id: { $in: [...group.ids.values()] } },
      { projection: Object.fromEntries(["_id", ...paths].map((path) => [path, 1])) }
    )
    .toArray();
  const byId = new Map(rows.map((row) => [idKey(row._id), row]));
  return group.legs.every((leg) => {
    const row = byId.get(idKey(leg.filter!._id));
    // Missing targets keep the journal's existing explicit recovery behavior.
    return (
      !row ||
      cashDeltaIsRepresented(
        balanceAt(row, leg.path!),
        (leg.kind === "debit" ? -1 : 1) * leg.amount
      )
    );
  });
}
