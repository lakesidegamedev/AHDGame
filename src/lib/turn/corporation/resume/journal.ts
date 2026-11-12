/**
 * Shell for the corporation turn plan journal. With the resilience stage below 2
 * every call applies its ops directly, exactly as before. At stage 2 the computed
 * plan is stored in chunks before the first write and each chunk is marked applied,
 * so an interrupted turn applies the stored plan instead of recomputing it.
 */
import { workerConfig } from "@/lib/config/worker";
import { BSON, type Db, type Document } from "mongodb";

const { EJSON } = BSON;
import { corporationTurnJournalCollection } from "@/lib/db/repositories/corporationTurnJournal";
import {
  chunkBySize,
  remainingChunks,
  decodeOutput,
  encodeOutput,
  isStorableOutput,
  stampPlan,
  stepAction,
  type CorporationTurnJournal,
  type StartedPolicy,
  type CorporationTurnStep,
} from "./rules";

/** Rehearsal override for the chunk size, so a small world still spans several chunks. */
const MAX_OPS_PER_CHUNK =
  Number(workerConfig.corpTurnChunk()) > 0 ? Number(workerConfig.corpTurnChunk()) : 2000;
const MAX_BYTES_PER_CHUNK = 8 * 1024 * 1024;
const TURNS_KEPT = 3;

/**
 * Rehearsal fault: AHD_CORP_TURN_FAULT=<point>:<mode> where mode is `throw` or `kill`.
 * Points: `<step>` (after the step ran, before its done mark) and `<step>@<chunk>`
 * (after that plan chunk applied, before its mark). Only honoured at stage 2.
 */
function faultAt(ctx: JournalContext, point: string): void {
  const spec = workerConfig.corpTurnFault();
  if (!spec || ctx.stage < 2) return;
  const [target, mode] = spec.split(":");
  if (target !== point) return;
  if (mode === "kill") process.kill(process.pid, "SIGKILL");
  throw new Error(`rehearsal fault at ${point}`);
}

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
  return header
    ? { turn: header.turn, steps: header.steps ?? {}, phases: header.phases ?? {} }
    : null;
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
      faultAt(ctx, `${step}@${index}`);
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
    faultAt(ctx, `${step}@${index}`);
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

export class CorporationTurnStepRefusedError extends Error {
  constructor(readonly step: string) {
    super(
      `corporationTurn step ${step} was interrupted and is not proven safe to repeat; the turn stops for repair`
    );
    this.name = "CorporationTurnStepRefusedError";
  }
}

const outputId = (key: string, name: string) => `${key}:out:${name}`;

async function setPhase(ctx: JournalContext, name: string, status: "started" | "done") {
  await rows(ctx.db).updateOne(
    { _id: journalKey(ctx) },
    {
      $set: { [`phases.${name}`]: status },
      $setOnInsert: { kind: "header", turn: ctx.turn, createdAt: new Date() },
    },
    { upsert: true }
  );
}

/**
 * Run a whole-call step once per turn. Below stage 2 this is just `fn()`. At stage 2
 * the step is marked started, then done; a resume skips a done step and applies
 * `onStarted` to one that was interrupted. Only use for steps whose result the
 * caller does not need when skipped.
 */
export async function runJournaledStep(
  ctx: JournalContext,
  name: string,
  onStarted: StartedPolicy,
  fn: () => Promise<unknown>
): Promise<void> {
  if (ctx.stage < 2) {
    await fn();
    return;
  }
  const existing = await readJournal(ctx);
  const action = stepAction(existing?.phases?.[name], onStarted);
  if (action === "skip") return;
  if (action === "refuse") throw new CorporationTurnStepRefusedError(name);
  if (action === "run") await setPhase(ctx, name, "started");
  await fn();
  faultAt(ctx, name);
  await setPhase(ctx, name, "done");
}

/**
 * Like runJournaledStep for a step whose result later steps read. The result is
 * stored with the done marker and restored on resume. A result that cannot survive
 * storage (Maps, class instances) is not stored, and a resume then refuses.
 */
export async function runJournaledStepWithOutput<T>(
  ctx: JournalContext,
  name: string,
  onStarted: StartedPolicy,
  fn: () => Promise<T>
): Promise<T> {
  if (ctx.stage < 2) return fn();
  const journal = rows(ctx.db);
  const key = journalKey(ctx);
  const existing = await readJournal(ctx);
  const action = stepAction(existing?.phases?.[name], onStarted);
  if (action === "skip") {
    const row = await journal.findOne({ _id: outputId(key, name) });
    if (!row || typeof row.payload !== "string")
      throw new CorporationTurnStepRefusedError(`${name} (output not stored)`);
    return decodeOutput(EJSON.parse(row.payload, { relaxed: true })) as T;
  }
  if (action === "refuse") throw new CorporationTurnStepRefusedError(name);
  if (action === "run") await setPhase(ctx, name, "started");
  const result = await fn();
  faultAt(ctx, name);
  if (isStorableOutput(result)) {
    await journal.updateOne(
      { _id: outputId(key, name) },
      {
        $set: {
          kind: "output",
          turn: ctx.turn,
          payload: EJSON.stringify(encodeOutput(result) as Document, { relaxed: false }),
        },
      },
      { upsert: true }
    );
    await setPhase(ctx, name, "done");
  }
  // An unstorable result leaves the step `started`: a resume refuses (or reruns
  // when the caller declared the step safe to repeat).
  return result;
}

/** A fresh start of a turn number drops any journal left from an earlier run of that number. */
export async function clearJournalForTurn(ctx: JournalContext): Promise<void> {
  await corporationTurnJournalCollection<Document>(ctx.db).deleteMany({ turn: ctx.turn });
}
