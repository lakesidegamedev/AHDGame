/**
 * Shell for the corporation turn plan journal. With the resilience stage below 2
 * every call applies its ops directly, exactly as before. At stage 2 the computed
 * plan is stored in chunks before the first write and each chunk is marked applied,
 * so an interrupted turn applies the stored plan instead of recomputing it.
 */
import { BSON, type Db, type Document } from "mongodb";

const { EJSON } = BSON;
import { corporationTurnJournalCollection } from "@/lib/db/repositories/corporationTurnJournal";
import {
  chunkBySize,
  remainingChunks,
  stampPlan,
  type CorporationTurnJournal,
  type CorporationTurnStep,
} from "./rules";

const MAX_OPS_PER_CHUNK = 2000;
const MAX_BYTES_PER_CHUNK = 8 * 1024 * 1024;
const TURNS_KEPT = 3;

export interface JournalContext {
  db: Db;
  stage: number;
  turn: number;
  worldEpoch?: string | null;
}

interface HeaderDoc extends CorporationTurnJournal {
  _id: string;
  kind: "header";
}

interface ChunkDoc extends Document {
  _id: string;
  kind: "chunk";
  turn: number;
  step: CorporationTurnStep;
  index: number;
  payload: string;
}

/** Journal rows are keyed by string ids, unlike the default ObjectId document. */
interface JournalRow extends Document {
  _id: string;
}

function rows(db: Db) {
  return corporationTurnJournalCollection<JournalRow>(db);
}

async function markChunkApplied(
  journal: ReturnType<typeof rows>,
  key: string,
  step: CorporationTurnStep,
  index: number
): Promise<void> {
  await journal.updateOne({ _id: key }, { $addToSet: { [`steps.${step}.applied`]: index } });
}

export function journalKey(ctx: Pick<JournalContext, "turn" | "worldEpoch">): string {
  return `${ctx.worldEpoch ?? "legacy"}:${ctx.turn}`;
}

const chunkId = (key: string, step: CorporationTurnStep, index: number) =>
  `${key}:${step}:${index}`;

export async function readJournal(ctx: JournalContext): Promise<CorporationTurnJournal | null> {
  const header = await corporationTurnJournalCollection<HeaderDoc & JournalRow>(ctx.db).findOne({
    _id: journalKey(ctx),
  });
  return header ? { turn: header.turn, steps: header.steps ?? {} } : null;
}

export type JournaledApplyResult = "direct" | "planned" | "replayed" | "unreplayable";

/**
 * Apply `ops` through the journal. `apply` writes one chunk of ops.
 * `stamp` adds the per-turn guard to every updateOne; pass false for ops that
 * already carry their own per-turn stamp.
 */
export async function applyJournaledOps<Op extends object>(
  ctx: JournalContext,
  step: CorporationTurnStep,
  ops: readonly Op[],
  apply: (chunk: Op[]) => Promise<void>,
  options: { stamp: boolean } = { stamp: true }
): Promise<JournaledApplyResult> {
  if (ctx.stage < 2) {
    if (ops.length > 0) await apply([...ops]);
    return "direct";
  }
  const journal = rows(ctx.db);
  const key = journalKey(ctx);
  const existing = await readJournal(ctx);
  const stored = existing?.turn === ctx.turn ? existing.steps[step] : undefined;
  if (stored) {
    if (stored.replayable === false) return "unreplayable";
    const pending = remainingChunks(existing!, step);
    const stored_chunks = await journal
      .find({ _id: { $in: pending.map((index) => chunkId(key, step, index)) } })
      .toArray();
    const payloadById = new Map(stored_chunks.map((doc) => [doc._id, String(doc.payload)]));
    for (const index of pending) {
      const payload = payloadById.get(chunkId(key, step, index));
      if (payload === undefined)
        throw new Error(`corporation turn plan chunk ${step}:${index} is missing`);
      await apply(EJSON.parse(payload, { relaxed: true }) as Op[]);
      await markChunkApplied(journal, key, step, index);
    }
    return "replayed";
  }
  if (ops.length === 0) return "direct";

  const stamped = options.stamp ? stampPlan(ops, step, ctx.turn) : { ops: [...ops], unstamped: 0 };
  const encoded = stamped.ops.map((op) => EJSON.stringify(op, { relaxed: false }));
  const indexed = stamped.ops.map((op, i) => ({ op, size: encoded[i]!.length, text: encoded[i]! }));
  const chunks = chunkBySize(indexed, (x) => x.size, MAX_OPS_PER_CHUNK, MAX_BYTES_PER_CHUNK);

  await journal.updateOne(
    { _id: key },
    {
      $setOnInsert: { kind: "header", turn: ctx.turn, createdAt: new Date() },
    },
    { upsert: true }
  );
  const docs: ChunkDoc[] = chunks.map((chunk, index) => ({
    _id: chunkId(key, step, index),
    kind: "chunk",
    turn: ctx.turn,
    step,
    index,
    payload: `[${chunk.map((x) => x.text).join(",")}]`,
  }));
  // Chunk documents first, header entry last: a header entry proves every chunk exists.
  await journal.deleteMany({ turn: ctx.turn, step, kind: "chunk" });
  if (docs.length > 0) await journal.insertMany(docs);
  await journal.updateOne(
    { _id: key },
    {
      $set: {
        [`steps.${step}`]: {
          chunks: docs.length,
          applied: [],
          replayable: stamped.unstamped === 0,
        },
      },
    }
  );

  for (const [index, chunk] of chunks.entries()) {
    await apply(chunk.map((x) => x.op));
    await markChunkApplied(journal, key, step, index);
  }
  return "planned";
}

/** Drop journals of turns no resume can still need. Cheap: the collection holds a few turns. */
export async function pruneJournal(ctx: JournalContext): Promise<void> {
  if (ctx.stage < 2) return;
  await rows(ctx.db).deleteMany({
    turn: { $lt: ctx.turn - TURNS_KEPT },
  });
}
