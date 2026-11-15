/** Update projections retain target proof until their journal acknowledges delivery. */
import { isDeepStrictEqual } from "node:util";
import { ObjectId, type Db, type Document, type Filter, type UpdateFilter } from "mongodb";
import { SETTLED_KEYS_CAP } from "./moneyMove";
import { reviveObjectIds } from "./settlementEncoding";
import type { TransitionProjection } from "./rules/boundary";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";
import { bankLoansCollection } from "@/lib/db/repositories/bankLoans";
import {
  settlementTargetSnapshot,
  rememberSettlementTarget,
  forgetSettlementTarget,
} from "./settlementReadSnapshot";

const RECEIPT = "pendingSettlementProjection";
const REVISION = "settlementProjectionRevision";
interface Receipt {
  key: string;
  index: number;
  generation: number;
}
interface Target {
  _id: unknown;
  settledKeys?: string[];
  pendingSettlementProjection?: Receipt;
  settlementProjectionRevision?: number;
}
interface ProjectionRecord {
  applied?: boolean;
  appliedAt?: Date | null;
  receiptProtocol?: string;
  projection: TransitionProjection;
}
interface Journal {
  _id: string;
  status?: string;
  error?: string;
  projections?: ProjectionRecord[];
}
type Outcome = { ok: true; newlyApplied: boolean } | { ok: false; error: string };
export interface LoanProjectionBatch {
  targets: Map<string, Target>;
  record: Journal;
  delivered: Array<{ id: unknown; receipt: Receipt }>;
}
const targetKey = (id: unknown) => `${typeof id}:${String(id)}`;

/** Read every loan target before its journal; CAS guards still serialize each write. */
export async function prepareLoanProjectionBatch(
  db: Db,
  key: string,
  projections: readonly TransitionProjection[]
): Promise<LoanProjectionBatch | undefined> {
  const loans = projections.filter((p) => p.collection === "bankLoans" && isUpdateProjection(p));
  if (loans.length < 2 || loans.some(invalidProjectionTarget)) return undefined;
  const ids = loans
    .map((p) => reviveObjectIds(p.filter)?._id)
    .filter((id): id is string | ObjectId => typeof id === "string" || id instanceof ObjectId);
  if (ids.length !== loans.length) return undefined;
  if (new Set(ids.map(targetKey)).size !== ids.length) return undefined;
  const targets = await bankLoansCollection<Target & { _id: string | ObjectId }>(db)
    .find(
      { _id: { $in: ids } },
      {
        projection: { [RECEIPT]: 1, [REVISION]: 1, settledKeys: 1 },
      }
    )
    .toArray();
  const record = await bankMoneyMovesCollection<Journal>(db).findOne(
    { _id: key },
    { projection: { projections: 1, status: 1 } }
  );
  if (!record || record.status === "rejected") return undefined;
  return {
    targets: new Map(targets.map((target) => [targetKey(target._id), target])),
    record,
    delivered: [],
  };
}

/** Receipts remain on targets until one durable journal acknowledgement covers the batch. */
export async function flushLoanProjectionBatch(
  db: Db,
  key: string,
  batch: LoanProjectionBatch | undefined
): Promise<void> {
  if (!batch?.delivered.length) return;
  const marks: Record<string, unknown> = {};
  const identities = batch.delivered.map(({ id, receipt }) => {
    const path = `projections.${receipt.index}`;
    marks[`${path}.applied`] = true;
    marks[`${path}.appliedAt`] = new Date();
    const identity =
      id instanceof ObjectId
        ? {
            $or: [
              { [`${path}.projection.filter._id`]: id },
              { [`${path}.projection.filter._id`]: { $eq: { $oid: id.toHexString() } } },
            ],
          }
        : { [`${path}.projection.filter._id`]: id };
    return { [`${path}.projection.collection`]: "bankLoans", ...identity };
  });
  const ack = await bankMoneyMovesCollection<Journal>(db).updateOne(
    { _id: key, status: { $ne: "rejected" }, $and: identities },
    { $set: marks }
  );
  if (!ack.matchedCount) throw new Error("Loan projection batch requires journal reconciliation");
  await bankLoansCollection<Target>(db).bulkWrite(
    batch.delivered.map(({ id, receipt }) => ({
      updateOne: {
        filter: { _id: id, [RECEIPT]: receipt } as Filter<Target>,
        update: { $unset: { [RECEIPT]: "" } },
      },
    }))
  );
  batch.delivered.length = 0;
}
const reserved = (path: string) =>
  [RECEIPT, REVISION, "settledKeys", "_id"].some((p) => path === p || path.startsWith(`${p}.`));
function reservedGuard(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, child]) =>
      [RECEIPT, REVISION, "settledKeys"].some((p) => key === p || key.startsWith(`${p}.`)) ||
      reservedGuard(child)
  );
}
export function isUpdateProjection(projection: TransitionProjection): boolean {
  return Boolean(projection.update || projection.pipelineUpdate);
}
function hasStableTarget(projection: TransitionProjection): boolean {
  const id = reviveObjectIds(projection.filter)?._id;
  return typeof id === "string" || typeof id === "number" || id instanceof ObjectId;
}
/** Preserve selector callers while freezing the exact target before claiming money. */
export async function bindProjectionTargets(
  db: Db,
  key: string,
  projections: TransitionProjection[]
): Promise<
  { projections: TransitionProjection[] } | { error: string; status?: "rejected" | "partial" }
> {
  if (!projections.some((p) => isUpdateProjection(p) && !hasStableTarget(p)))
    return { projections };
  const existing = await bankMoneyMovesCollection<Journal>(db).findOne(
    { _id: key },
    { projection: { projections: 1, status: 1, error: 1 } }
  );
  if (existing?.status === "rejected")
    return {
      error: existing.error ?? "Original projection binding was rejected",
      status: "rejected",
    };
  if (existing && !existing.projections)
    return {
      error: "Existing journal has no frozen projection plan; reconciliation is required",
      status: "partial",
    };
  if (existing?.projections) {
    const original = existing.projections.map((p) => p.projection);
    if (original.some((p) => isUpdateProjection(p) && !hasStableTarget(p)))
      return {
        error: "Legacy projection selector has no frozen target; reconciliation is required",
        status: "partial",
      };
    return { projections: original };
  }
  const bound: TransitionProjection[] = [];
  for (const projection of projections) {
    if (!isUpdateProjection(projection) || hasStableTarget(projection)) {
      bound.push(projection);
      continue;
    }
    if (!projection.filter) return { error: "Update projection has no target selector" };
    const filter = reviveObjectIds(projection.filter) as Document;
    const target = await db
      .collection(projection.collection)
      .findOne(filter, { projection: { _id: 1 } });
    if (!target) return { error: `projection "${projection.note}" matched no document` };
    bound.push({ ...projection, filter: { ...filter, _id: target._id } });
  }
  return { projections: bound };
}
export function invalidProjectionTarget(projection: TransitionProjection): boolean {
  if (!isUpdateProjection(projection)) return false;
  if (projection.insert || (projection.update && projection.pipelineUpdate)) return true;
  const filter = reviveObjectIds(projection.filter) as Document | undefined;
  const id = filter?._id;
  if (!(typeof id === "string" || typeof id === "number" || id instanceof ObjectId)) return true;
  if (reservedGuard(filter)) return true;
  if (projection.pipelineUpdate) {
    return (
      projection.pipelineUpdate.length === 0 ||
      projection.pipelineUpdate.some((stage) => {
        const entries = Object.entries(stage);
        if (entries.length !== 1 || entries[0][0] !== "$set") return true;
        const fields = entries[0][1];
        return (
          !fields ||
          typeof fields !== "object" ||
          Array.isArray(fields) ||
          Object.keys(fields).some(reserved)
        );
      })
    );
  }
  return Object.entries(projection.update!).some(
    ([operator, fields]) =>
      !operator.startsWith("$") ||
      !fields ||
      typeof fields !== "object" ||
      Object.entries(fields).some(
        ([path, value]) =>
          reserved(path) || (operator === "$rename" && typeof value === "string" && reserved(value))
      )
  );
}

async function acknowledge(
  db: Db,
  collection: string,
  id: unknown,
  receipt: Receipt
): Promise<void> {
  const journal = bankMoneyMovesCollection<Journal>(db);
  const path = `projections.${receipt.index}`;
  const identity =
    id instanceof ObjectId
      ? {
          $or: [
            { [`${path}.projection.filter._id`]: id },
            { [`${path}.projection.filter._id`]: { $eq: { $oid: id.toHexString() } } },
          ],
        }
      : { [`${path}.projection.filter._id`]: id };
  const ack = await journal.updateOne(
    {
      _id: receipt.key,
      status: { $ne: "rejected" },
      [`${path}.applied`]: { $ne: true },
      [`${path}.projection.collection`]: collection,
      ...identity,
    },
    { $set: { [`${path}.applied`]: true, [`${path}.appliedAt`]: new Date() } }
  );
  if (!ack.matchedCount) {
    const saved = await journal.findOne(
      { _id: receipt.key },
      { projection: { projections: 1, status: 1 } }
    );
    const projection = saved?.projections?.[receipt.index];
    if (
      saved?.status === "rejected" ||
      !projection?.applied ||
      projection.projection.collection !== collection ||
      !isDeepStrictEqual(reviveObjectIds(projection.projection.filter)?._id, id)
    )
      throw new Error("Projection target outcome requires journal reconciliation");
  }
  await db
    .collection<Target>(collection)
    .updateOne({ _id: id, [RECEIPT]: receipt } as Filter<Target>, { $unset: { [RECEIPT]: "" } });
}

/** Read target before journal so a delayed writer cannot reuse a consumed generation. */
export async function applyProtectedProjection(
  db: Db,
  key: string,
  index: number,
  projection: TransitionProjection,
  batch?: LoanProjectionBatch,
  readSnapshot?: { epoch: number; record: Journal | null }
): Promise<Outcome> {
  if (invalidProjectionTarget(projection))
    return {
      ok: false,
      error: "Update projection requires a stable target id and unreserved fields",
    };
  const filter = reviveObjectIds(projection.filter) as Document;
  const target = db.collection<Target>(projection.collection);
  const journal = bankMoneyMovesCollection<Journal>(db);
  const id = { _id: filter._id } as Filter<Target>;
  const stamp = `${key}#${index}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const cached = attempt === 0 && projection.collection === "bankLoans" ? batch : undefined;
    const previous =
      attempt === 0
        ? settlementTargetSnapshot<Target>(db, "projection", projection.collection, filter._id)
        : undefined;
    const current = cached
      ? cached.targets.get(targetKey(filter._id))
      : previous
        ? previous.value
        : await target.findOne(id, {
            projection: { [RECEIPT]: 1, [REVISION]: 1, settledKeys: 1 },
          });
    const record =
      cached?.record ??
      (previous && readSnapshot && previous.epoch <= readSnapshot.epoch
        ? readSnapshot.record
        : await journal.findOne({ _id: key }, { projection: { projections: 1 } }));
    const saved = record?.projections?.[index];
    if (!saved) return { ok: false, error: "Projection is missing from its original journal" };
    const originalFilter = reviveObjectIds(saved.projection.filter) as Document | undefined;
    if (
      saved.projection.collection !== projection.collection ||
      !isDeepStrictEqual(originalFilter?._id, filter._id) ||
      invalidProjectionTarget(saved.projection)
    )
      return { ok: false, error: "Projection target differs from its original journal" };
    const update = reviveObjectIds(saved.projection.update) as Document | undefined;
    const pipeline = reviveObjectIds(saved.projection.pipelineUpdate);
    const receipt = current?.pendingSettlementProjection;
    if (receipt) {
      await acknowledge(db, projection.collection, filter._id, receipt);
      forgetSettlementTarget(db, "projection", projection.collection, filter._id);
      if (receipt.key === key && receipt.index === index) return { ok: true, newlyApplied: false };
      continue;
    }
    if (saved.applied || saved.appliedAt) return { ok: true, newlyApplied: false };
    if (!current)
      return { ok: false, error: `projection "${projection.note}" matched no document` };
    if (saved.receiptProtocol !== "protected_v1") {
      if (!current.settledKeys?.includes(stamp))
        return {
          ok: false,
          error:
            "Legacy pending projection has no surviving target proof; reconciliation is required",
        };
      await acknowledge(db, projection.collection, filter._id, { key, index, generation: 0 });
      return { ok: true, newlyApplied: false };
    }
    const revision = current.settlementProjectionRevision ?? 0;
    if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER)
      return { ok: false, error: "Projection target has an invalid generation" };
    const guard = {
      ...id,
      [RECEIPT]: { $exists: false },
      [REVISION]: Object.hasOwn(current, REVISION)
        ? current.settlementProjectionRevision
        : { $exists: false },
    };
    const delivered: Receipt = { key, index, generation: revision + 1 };
    const write = await target.updateOne(
      { $and: [originalFilter!, guard] } as Filter<Target>,
      pipeline
        ? [
            ...pipeline,
            {
              $set: {
                [REVISION]: revision + 1,
                [RECEIPT]: { $literal: delivered },
                settledKeys: {
                  $slice: [
                    { $concatArrays: [{ $ifNull: ["$settledKeys", []] }, { $literal: [stamp] }] },
                    -SETTLED_KEYS_CAP,
                  ],
                },
              },
            },
          ]
        : ({
            ...update,
            $inc: { ...update?.$inc, [REVISION]: 1 },
            $set: { ...update?.$set, [RECEIPT]: delivered },
            $push: { ...update?.$push, settledKeys: { $each: [stamp], $slice: -SETTLED_KEYS_CAP } },
          } as UpdateFilter<Target>)
    );
    if (write.matchedCount) {
      if (batch && projection.collection === "bankLoans")
        batch.delivered.push({ id: filter._id, receipt: delivered });
      else {
        await acknowledge(db, projection.collection, filter._id, delivered);
        rememberSettlementTarget(db, "projection", projection.collection, filter._id, {
          _id: filter._id,
          settlementProjectionRevision: delivered.generation,
          settledKeys: [...(current.settledKeys ?? []), stamp].slice(-SETTLED_KEYS_CAP),
        });
      }
      return { ok: true, newlyApplied: true };
    }
  }
  return {
    ok: false,
    error: `projection "${projection.note}" did not match its original guard; retry after reconciliation`,
  };
}
