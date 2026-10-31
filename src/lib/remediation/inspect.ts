// Read-only database inspection.
//
// Half the reason people open mongosh against prod is not to change anything —
// it is to look. If looking requires a shell, the shell is already open when
// the urge to fix something arrives, and the next command is an unlogged
// updateMany. Giving the ledger a first-class read tool closes that door.
//
// Strictly read-only: find, count and distinct. No aggregation pipelines
// (`$merge` and `$out` write), no `$where`, no eval.

import { ObjectId, type Db, type Filter, type Document, type Sort } from "mongodb";

export const MAX_QUERY_LIMIT = 200;

export interface QuerySpec {
  collection: string;
  filter?: Record<string, unknown>;
  projection?: Record<string, 0 | 1>;
  sort?: Record<string, 1 | -1>;
  limit?: number;
}

export interface QueryResult {
  collection: string;
  matched: number;
  returned: number;
  docs: Document[];
  truncated: boolean;
}

/** `$where` and `$function` execute JavaScript server-side. Never accept them. */
function assertNoCodeExecution(filter: Record<string, unknown>): void {
  const serialized = JSON.stringify(filter ?? {});
  for (const banned of ["$where", "$function", "$accumulator", "$expr.$function"]) {
    if (serialized.includes(banned)) {
      throw new Error(`[remediation] "${banned}" is not permitted in a query filter`);
    }
  }
}

/**
 * Filters arrive as JSON, which has no ObjectId or Date. Callers (agents
 * especially) write them in Extended JSON, `{ "$oid": "..." }` and
 * `{ "$date": "..." }`, and Mongo rejects those as unknown operators, or with
 * "cannot nest $ under $in" inside an `$in` list. Revive those two shapes into
 * real values so an id or date lookup works. Anything else passes through.
 */
export function reviveExtendedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveExtendedJson);
  if (!value || typeof value !== "object" || value instanceof ObjectId || value instanceof Date)
    return value;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (
    keys.length === 1 &&
    keys[0] === "$oid" &&
    typeof obj.$oid === "string" &&
    ObjectId.isValid(obj.$oid)
  )
    return new ObjectId(obj.$oid);
  if (keys.length === 1 && keys[0] === "$date") {
    const raw = obj.$date;
    const date = new Date(
      typeof raw === "object" && raw && "$numberLong" in raw
        ? Number((raw as { $numberLong: string }).$numberLong)
        : (raw as string | number)
    );
    if (!Number.isNaN(date.getTime())) return date;
  }
  return Object.fromEntries(keys.map((k) => [k, reviveExtendedJson(obj[k])]));
}

const readFilter = (filter: Record<string, unknown> | undefined): Filter<Document> => {
  assertNoCodeExecution(filter ?? {});
  return reviveExtendedJson(filter ?? {}) as Filter<Document>;
};

export async function runQuery(db: Db, spec: QuerySpec): Promise<QueryResult> {
  if (!spec.collection) throw new Error("[remediation] query needs a collection");
  const filter = readFilter(spec.filter);

  const limit = Math.min(spec.limit ?? 25, MAX_QUERY_LIMIT);
  const matched = await db.collection(spec.collection).countDocuments(filter);

  let cursor = db.collection(spec.collection).find(filter).limit(limit);
  if (spec.projection) cursor = cursor.project(spec.projection) as typeof cursor;
  if (spec.sort) cursor = cursor.sort(spec.sort as Sort);
  const docs = await cursor.toArray();

  return {
    collection: spec.collection,
    matched,
    returned: docs.length,
    docs,
    truncated: matched > docs.length,
  };
}

export async function runCount(
  db: Db,
  collection: string,
  filter: Record<string, unknown> = {}
): Promise<number> {
  return db.collection(collection).countDocuments(readFilter(filter));
}

export async function runDistinct(
  db: Db,
  collection: string,
  field: string,
  filter: Record<string, unknown> = {}
): Promise<unknown[]> {
  const values = await db.collection(collection).distinct(field, readFilter(filter));
  return values.slice(0, MAX_QUERY_LIMIT);
}

/** Collection names plus document counts. The "what is even in here" call. */
const COLLECTION_COUNT_CONCURRENCY = 16;

export async function listCollections(db: Db): Promise<Array<{ name: string; count: number }>> {
  const names = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith("system."))
    .sort();
  // One count per collection, several hundred of them, over a remote link:
  // run them in bounded parallel so the listing stays well under a minute.
  const rows: Array<{ name: string; count: number }> = new Array(names.length);
  let next = 0;
  const worker = async () => {
    while (next < names.length) {
      const i = next++;
      rows[i] = { name: names[i], count: await db.collection(names[i]).estimatedDocumentCount() };
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(COLLECTION_COUNT_CONCURRENCY, names.length) }, worker)
  );
  return rows;
}
