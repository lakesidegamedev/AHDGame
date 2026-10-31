/**
 * Collapse the corporation turn's per-document cash writes into one op each.
 *
 * The turn builds its corporation book from many independent collectors: the
 * sector pass, NPP decisions, brand loyalty, quality, group forecasts and
 * holding maturation each push an op for the same document. A bulkWrite applies
 * them one at a time, and every one of those rewrites the whole 20 KB
 * corporation document, so the write cost is op count, not payload. Merging the
 * unguarded ops for one corporation into a single update drops about half of
 * them without changing the final document.
 *
 * Only ops whose filter is exactly `{ _id }` are merged. A guarded op (for
 * example the sector write's `advertisingMarketSettledTurnV1: { $ne: turn }`
 * stamp) keeps its own update, because merging it would apply its writes when
 * the guard fails, or drop the unguarded writes when it passes.
 *
 * Values are applied in the original order, so a field written twice keeps the
 * later value, `$inc` accumulates, `$push` keeps its order and `$unset` removes
 * the field. Where a merged op and a guarded op touch the same field, the doc is
 * left unmerged unless the two writes are provably interchangeable (both `$inc`,
 * or both `$set` to the same value).
 */

import type { AnyBulkWriteOperation, Document } from "mongodb";

type Update = Record<string, unknown>;
type AnyOp = AnyBulkWriteOperation<Document>;

const MERGEABLE_OPERATORS = new Set(["$set", "$inc", "$push", "$unset"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date)
  );
}

/** The `_id` a single-key `{ _id }` updateOne targets, or null for any other op. */
function unguardedId(op: AnyOp): unknown | null {
  if (!("updateOne" in op)) return null;
  const filter = op.updateOne.filter as Record<string, unknown>;
  if (!isPlainObject(filter)) return null;
  const keys = Object.keys(filter);
  if (keys.length !== 1 || keys[0] !== "_id") return null;
  return filter._id;
}

/** The document an updateOne targets, whatever else its filter guards on. */
function updatedId(op: AnyOp): unknown | null {
  if (!("updateOne" in op)) return null;
  const filter = op.updateOne.filter as Record<string, unknown>;
  if (!isPlainObject(filter)) return null;
  return filter._id ?? null;
}

/** A replaceOne or pipeline update cannot be folded into a `$set`/`$inc` merge. */
function mergeableUpdate(op: AnyOp): Update | null {
  if (!("updateOne" in op)) return null;
  const update = op.updateOne.update;
  if (!isPlainObject(update)) return null;
  if (!Object.keys(update).every((operator) => MERGEABLE_OPERATORS.has(operator))) return null;
  for (const [operator, payload] of Object.entries(update)) {
    if (!isPlainObject(payload)) return null;
    if (operator === "$inc" && Object.values(payload).some((value) => typeof value !== "number")) {
      return null;
    }
    // `$slice`, `$position` and `$sort` act on the combined array, so folding
    // two pushes would change what they keep.
    if (
      operator === "$push" &&
      Object.values(payload).some(
        (value) =>
          isPlainObject(value) &&
          "$each" in value &&
          Object.keys(value).some((key) => key !== "$each")
      )
    ) {
      return null;
    }
  }
  return update;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Field -> operator kind and value, for conflict checks against guarded ops. */
function fieldWrites(update: Update): Map<string, { operator: string; value: unknown }> {
  const fields = new Map<string, { operator: string; value: unknown }>();
  for (const [operator, payload] of Object.entries(update)) {
    if (!isPlainObject(payload)) continue;
    for (const [field, value] of Object.entries(payload)) fields.set(field, { operator, value });
  }
  return fields;
}

/** Two update paths touch the same value: equal, or one is a prefix of the other. */
function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);
}

/**
 * True when one merged update names overlapping paths under different operators
 * or two overlapping paths at all ("a" and "a.b"). The server rejects such an
 * update as a conflict, where the separate ops it came from applied in sequence.
 */
function hasInternalConflict(update: Update): boolean {
  const paths: string[] = [];
  for (const payload of Object.values(update)) {
    if (!isPlainObject(payload)) continue;
    paths.push(...Object.keys(payload));
  }
  for (let i = 0; i < paths.length; i++)
    for (let j = i + 1; j < paths.length; j++) if (pathsOverlap(paths[i], paths[j])) return true;
  return false;
}

/**
 * True when a merged op and any guarded op on the same document write the same
 * field in a way whose order matters.
 */
function conflictsWithGuarded(merged: Update, guarded: readonly Update[]): boolean {
  const mergedFields = fieldWrites(merged);
  for (const update of guarded) {
    for (const [field, write] of fieldWrites(update)) {
      for (const other of mergedFields.keys())
        if (other !== field && pathsOverlap(other, field)) return true;
      const ours = mergedFields.get(field);
      if (!ours) continue;
      const bothIncrement = ours.operator === "$inc" && write.operator === "$inc";
      const sameSet =
        ours.operator === "$set" && write.operator === "$set" && sameValue(ours.value, write.value);
      if (!bothIncrement && !sameSet) return true;
    }
  }
  return false;
}

type MergeState = {
  set: Record<string, unknown>;
  inc: Record<string, number>;
  push: Map<string, unknown[]>;
  unset: Map<string, unknown>;
};

function emptyState(): MergeState {
  return { set: {}, inc: {}, push: new Map(), unset: new Map() };
}

/** Apply one update onto the running state, in the order the bulkWrite would. */
function applyToState(state: MergeState, update: Update): void {
  const set = isPlainObject(update.$set) ? update.$set : {};
  const inc = isPlainObject(update.$inc) ? update.$inc : {};
  const push = isPlainObject(update.$push) ? update.$push : {};
  const unset = isPlainObject(update.$unset) ? update.$unset : {};

  for (const [field, value] of Object.entries(set)) {
    state.set[field] = value;
    state.unset.delete(field);
  }
  for (const [field, value] of Object.entries(inc)) {
    if (typeof value !== "number") continue;
    state.inc[field] = (state.inc[field] ?? 0) + value;
    state.unset.delete(field);
  }
  for (const [field, value] of Object.entries(push)) {
    const elements = isPlainObject(value) && Array.isArray(value.$each) ? value.$each : [value];
    state.push.set(field, [...(state.push.get(field) ?? []), ...elements]);
    state.unset.delete(field);
  }
  for (const [field, value] of Object.entries(unset)) {
    delete state.set[field];
    delete state.inc[field];
    state.push.delete(field);
    state.unset.set(field, value);
  }
}

function stateToUpdate(state: MergeState): Update {
  const update: Update = {};
  if (Object.keys(state.set).length > 0) update.$set = state.set;
  if (Object.keys(state.inc).length > 0) update.$inc = state.inc;
  if (state.push.size > 0) {
    const push: Record<string, unknown> = {};
    for (const [field, elements] of state.push) {
      // One push keeps its original value shape: `$push` of an array element is
      // not the same document as `$push` with `$each` over that array.
      push[field] =
        elements.length === 0
          ? { $each: [] }
          : elements.length === 1
            ? elements[0]
            : { $each: elements };
    }
    update.$push = push;
  }
  if (state.unset.size > 0) update.$unset = Object.fromEntries(state.unset);
  return update;
}

/**
 * Merge every unguarded op for one corporation into a single update, keeping
 * the position of the first one. Ops that cannot be merged safely are returned
 * in their original order and untouched.
 */
export function mergeCorporationCashOps<Op extends object>(operations: readonly Op[]): Op[] {
  const candidates = new Map<string, number[]>();
  const guardedById = new Map<string, Update[]>();
  const unbatchable = new Set<string>();
  for (let index = 0; index < operations.length; index++) {
    const op = operations[index] as unknown as AnyOp;
    const id = updatedId(op);
    if (id === null) continue;
    const key = String(id);
    const update = mergeableUpdate(op);
    if (unguardedId(op) !== null && update) {
      const list = candidates.get(key);
      if (list) list.push(index);
      else candidates.set(key, [index]);
      continue;
    }
    // Anything else on the same document has to keep its own op. A pipeline or
    // replacement update also makes the whole document unsafe to merge, since
    // its effect cannot be reasoned about field by field.
    if (update) {
      const list = guardedById.get(key);
      if (list) list.push(update);
      else guardedById.set(key, [update]);
    } else {
      unbatchable.add(key);
    }
  }

  const replaced = new Map<number, AnyOp>();
  const dropped = new Set<number>();
  for (const [key, indexes] of candidates) {
    if (indexes.length < 2 || unbatchable.has(key)) continue;
    const state = emptyState();
    for (const index of indexes)
      applyToState(state, mergeableUpdate(operations[index] as unknown as AnyOp)!);
    const merged = stateToUpdate(state);
    if (Object.keys(merged).length === 0) continue;
    if (hasInternalConflict(merged)) continue;
    if (conflictsWithGuarded(merged, guardedById.get(key) ?? [])) continue;

    const first = operations[indexes[0]];
    const firstUpdate = (first as unknown as { updateOne: Record<string, unknown> }).updateOne;
    replaced.set(indexes[0], { updateOne: { ...firstUpdate, update: merged } } as unknown as AnyOp);
    for (const index of indexes.slice(1)) dropped.add(index);
  }

  if (replaced.size === 0) return [...operations];
  const out: unknown[] = [];
  for (let index = 0; index < operations.length; index++) {
    if (dropped.has(index)) continue;
    out.push(replaced.get(index) ?? operations[index]);
  }
  return out as Op[];
}
