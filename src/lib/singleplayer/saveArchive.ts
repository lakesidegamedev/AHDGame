import { createReadStream, createWriteStream } from "node:fs";
import { once } from "node:events";
import { createGunzip, createGzip, constants as zlibConstants } from "node:zlib";
import { BSON, type ClientSession, type Db, type Document } from "mongodb";

/**
 * The on-disk shape of one singleplayer save.
 *
 * A save is a gzip stream of frames, one logical dump of the world's database,
 * so it needs no tool the player does not already have (no `mongodump`), does
 * not depend on the MongoDB port or build that wrote it, and stays small: a
 * 1991 world is tens of MB of documents but hundreds of MB of database files.
 *
 *   frame  = type (1 byte) | payload length (uint32 LE) | payload
 *   header = BSON { format, database, createdAt }
 *   start  = BSON { name, options, indexes }       one per collection
 *   doc    = the document's own BSON bytes, copied as read (never decoded)
 *   end    = BSON { count }                         closes the collection
 *   trailer= BSON { collections, documents }        last frame; a stream
 *                                                   without it was cut short
 *
 * gzip's own CRC covers corruption inside the stream, the trailer covers a
 * truncated one. `verifySaveArchive` reads both before a restore may drop
 * anything.
 */
export const SAVE_ARCHIVE_FORMAT = 1;

const FRAME_HEADER = 0x01;
const FRAME_COLLECTION = 0x02;
const FRAME_DOCUMENT = 0x03;
const FRAME_COLLECTION_END = 0x04;
const FRAME_TRAILER = 0x05;

const FLUSH_BYTES = 1 << 20;
const INSERT_BATCH_DOCS = 1000;
const INSERT_BATCH_BYTES = 8 << 20;
const FINISHING_PARALLELISM = 8;
// Acknowledge on apply, then flush once at the end; a restore that dies half way is redone from the save anyway.
const RESTORE_WRITE = { w: 1 } as const;
// A document cannot exceed 16 MiB; anything larger in a frame is corruption.
const MAX_FRAME_BYTES = 32 << 20;
// Local worlds can take a while to dump on a slow disk. Only the lifetime of
// the read snapshot is bounded by this, never the player.
const SNAPSHOT_LIFETIME_SECONDS = 900;

export interface SaveArchiveStats {
  collections: number;
  documents: number;
}

interface CollectionDescriptor {
  name: string;
  options: Document;
  indexes: Document[];
}

/** Collects frames into ~1 MiB writes so gzip sees large buffers, not millions of tiny ones. */
class FrameWriter {
  private pending: Buffer[] = [];
  private pendingBytes = 0;
  private readonly gzip = createGzip({ level: zlibConstants.Z_BEST_SPEED });
  private readonly file: ReturnType<typeof createWriteStream>;
  private failure: unknown = null;
  private readonly finished: Promise<void>;

  constructor(path: string) {
    this.file = createWriteStream(path);
    this.gzip.pipe(this.file);
    this.finished = new Promise<void>((resolve, reject) => {
      this.file.once("finish", resolve);
      this.file.once("error", (error) => {
        this.failure = error;
        reject(error);
      });
      this.gzip.once("error", (error) => {
        this.failure = error;
        reject(error);
      });
    });
    // The rejection is observed in close(); an early failure must not be unhandled.
    this.finished.catch(() => {});
  }

  async frame(type: number, payload: Uint8Array): Promise<void> {
    if (this.failure) throw this.failure;
    const head = Buffer.allocUnsafe(5);
    head[0] = type;
    head.writeUInt32LE(payload.byteLength, 1);
    this.pending.push(head, Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength));
    this.pendingBytes += 5 + payload.byteLength;
    if (this.pendingBytes >= FLUSH_BYTES) await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.pending.length === 0) return;
    const chunk = Buffer.concat(this.pending, this.pendingBytes);
    this.pending = [];
    this.pendingBytes = 0;
    if (!this.gzip.write(chunk)) await once(this.gzip, "drain");
  }

  async close(): Promise<void> {
    await this.flush();
    this.gzip.end();
    await this.finished;
  }

  /** Abandon a failed write without leaving a file handle open (Windows cannot delete an open file). */
  async abort(): Promise<void> {
    this.gzip.destroy();
    this.file.destroy();
    await new Promise<void>((resolve) => this.file.once("close", () => resolve()));
  }
}

async function describeCollections(db: Db): Promise<CollectionDescriptor[]> {
  const listed = await db.listCollections({}, { nameOnly: false }).toArray();
  const out: CollectionDescriptor[] = [];
  for (const entry of listed) {
    // Views carry no documents and are rebuilt by the code that defines them.
    if (entry.type !== "collection" || entry.name.startsWith("system.")) continue;
    const indexes = (await db.collection(entry.name).indexes()) as Document[];
    out.push({
      name: entry.name,
      options: (entry as { options?: Document }).options ?? {},
      indexes: indexes.filter((index) => index.name !== "_id_"),
    });
  }
  return out;
}

/**
 * Dump every collection of `db` into `file`. The reads share one snapshot
 * (a read-only transaction), so the save is the world as of a single moment
 * even though a turn or a click may write while it is being copied.
 */
export async function writeSaveArchive(db: Db, file: string): Promise<SaveArchiveStats> {
  const collections = await describeCollections(db);
  // Best effort: a stricter local mongod simply keeps its 60 second default.
  await db.client
    .db("admin")
    .command({ setParameter: 1, transactionLifetimeLimitSeconds: SNAPSHOT_LIFETIME_SECONDS })
    .catch(() => undefined);

  const writer = new FrameWriter(file);
  const session: ClientSession = db.client.startSession();
  let documents = 0;
  try {
    await writer.frame(
      FRAME_HEADER,
      BSON.serialize({
        format: SAVE_ARCHIVE_FORMAT,
        database: db.databaseName,
        createdAt: new Date(),
      })
    );
    session.startTransaction({
      readConcern: { level: "snapshot" },
      readPreference: "primary",
    });
    for (const collection of collections) {
      await writer.frame(FRAME_COLLECTION, BSON.serialize({ ...collection }));
      let count = 0;
      const cursor = db
        .collection(collection.name)
        .find({}, { session, raw: true, batchSize: 2000 } as never);
      for await (const raw of cursor as unknown as AsyncIterable<Uint8Array>) {
        await writer.frame(FRAME_DOCUMENT, raw);
        count += 1;
      }
      await writer.frame(FRAME_COLLECTION_END, BSON.serialize({ count }));
      documents += count;
    }
    await session.commitTransaction();
    await writer.frame(
      FRAME_TRAILER,
      BSON.serialize({ collections: collections.length, documents })
    );
    await writer.close();
  } catch (error) {
    await session.abortTransaction().catch(() => undefined);
    await writer.abort();
    throw error;
  } finally {
    await session.endSession().catch(() => undefined);
  }
  return { collections: collections.length, documents };
}

interface Frame {
  type: number;
  payload: Buffer;
}

async function* readFrames(file: string): AsyncGenerator<Frame> {
  const input = createReadStream(file);
  const source = createGunzip();
  // pipe() does not forward errors from the file stream; surface them here.
  input.once("error", (error) => source.destroy(error));
  input.pipe(source);
  let pending: Buffer = Buffer.alloc(0);
  try {
    for await (const chunk of source as AsyncIterable<Buffer>) {
      pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
      let offset = 0;
      while (pending.length - offset >= 5) {
        const length = pending.readUInt32LE(offset + 1);
        if (length > MAX_FRAME_BYTES) throw new Error("The save file is damaged (bad frame size).");
        if (pending.length - offset < 5 + length) break;
        yield {
          type: pending[offset]!,
          payload: pending.subarray(offset + 5, offset + 5 + length),
        };
        offset += 5 + length;
      }
      pending = offset === 0 ? pending : pending.subarray(offset);
    }
    if (pending.length > 0) throw new Error("The save file is cut short.");
  } finally {
    input.destroy();
    source.destroy();
  }
}

/** Reads the whole save and proves it is complete. Nothing is written anywhere. */
export async function verifySaveArchive(file: string): Promise<SaveArchiveStats> {
  let sawHeader = false;
  let collections = 0;
  let documents = 0;
  let inCollection = false;
  let collectionCount = 0;
  let trailer: Document | null = null;
  try {
    for await (const frame of readFrames(file)) {
      if (trailer) throw new Error("The save file has data after its end.");
      switch (frame.type) {
        case FRAME_HEADER: {
          const header = BSON.deserialize(frame.payload);
          if (header.format !== SAVE_ARCHIVE_FORMAT)
            throw new Error("This save was made by a newer version of the game.");
          sawHeader = true;
          break;
        }
        case FRAME_COLLECTION:
          if (!sawHeader || inCollection) throw new Error("The save file is damaged.");
          inCollection = true;
          collectionCount = 0;
          collections += 1;
          break;
        case FRAME_DOCUMENT:
          if (!inCollection) throw new Error("The save file is damaged.");
          collectionCount += 1;
          documents += 1;
          break;
        case FRAME_COLLECTION_END:
          if (!inCollection || BSON.deserialize(frame.payload).count !== collectionCount)
            throw new Error("The save file is damaged.");
          inCollection = false;
          break;
        case FRAME_TRAILER:
          trailer = BSON.deserialize(frame.payload);
          break;
        default:
          throw new Error("The save file is damaged (unknown record).");
      }
    }
  } catch (error) {
    if (error instanceof Error && /^The save|^This save/.test(error.message)) throw error;
    throw new Error(
      `The save file cannot be read (${error instanceof Error ? error.message : String(error)}).`
    );
  }
  if (
    !trailer ||
    inCollection ||
    trailer.collections !== collections ||
    trailer.documents !== documents
  )
    throw new Error("The save file is cut short.");
  return { collections, documents };
}

/** listIndexes output minus the fields createIndexes derives itself. */
function indexSpec(index: Document): Document {
  const spec = { ...index };
  delete spec.v;
  delete spec.ns;
  return spec;
}

const DECODE = { promoteValues: false, promoteBuffers: false } as const;

/** Order-independent description of an index, so a saved index can be matched to a live one. */
function indexSignature(spec: Document): string {
  const normalise = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalise);
    if (value && typeof value === "object" && !(value instanceof Date)) {
      return Object.fromEntries(
        Object.entries(value as Document)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([k, v]) => [k, normalise(v)])
      );
    }
    return value;
  };
  return JSON.stringify(normalise(indexSpec(spec)));
}

interface LiveCollection {
  options: string;
  indexes: Map<string, string>;
}

/** What the database holds now, so a restore can reuse collections instead of rebuilding them. */
async function readLiveCollections(db: Db): Promise<Map<string, LiveCollection>> {
  const live = new Map<string, LiveCollection>();
  for (const entry of await db.listCollections({}, { nameOnly: false }).toArray()) {
    if (entry.type !== "collection" || entry.name.startsWith("system.")) continue;
    const indexes = new Map<string, string>();
    for (const index of (await db.collection(entry.name).indexes()) as Document[]) {
      if (index.name !== "_id_") indexes.set(String(index.name), indexSignature(index));
    }
    live.set(entry.name, {
      options: JSON.stringify((entry as { options?: Document }).options ?? {}),
      indexes,
    });
  }
  return live;
}

/**
 * Make `db` hold exactly what the save holds. The caller verifies first, and
 * this must run while nothing else is writing (the game server does it before
 * it lets anyone in).
 *
 * A collection that already exists with the same options keeps its table and
 * its matching indexes: only the documents are swapped. Creating a collection
 * or an index costs a few file syncs each, and a world has hundreds of both,
 * so rebuilding the database from nothing took tens of seconds on a laptop
 * disk where swapping documents takes a few.
 */
export async function restoreSaveArchive(db: Db, file: string): Promise<SaveArchiveStats> {
  const live = await readLiveCollections(db);
  const seen = new Set<string>();
  let collections = 0;
  let documents = 0;
  let current:
    (CollectionDescriptor & { reused: LiveCollection | null; signatures: string[] }) | null = null;
  let currentCount = 0;
  let batch: Document[] = [];
  let batchBytes = 0;

  // Index and collection creation each wait on file syncs and do not depend on
  // one another, so they run beside the document stream instead of in line.
  const inflight = new Set<Promise<void>>();
  let failure: unknown = null;
  const later = async (task: () => Promise<void>) => {
    while (inflight.size >= FINISHING_PARALLELISM) await Promise.race(inflight);
    const running: Promise<void> = task()
      .catch((error: unknown) => {
        failure ??= error;
      })
      .finally(() => inflight.delete(running));
    inflight.add(running);
  };

  const flush = async () => {
    if (!current || batch.length === 0) return;
    const docs = batch;
    batch = [];
    batchBytes = 0;
    await db
      .collection(current.name)
      .insertMany(docs, { ordered: true, writeConcern: RESTORE_WRITE });
  };

  for await (const frame of readFrames(file)) {
    if (failure) break;
    switch (frame.type) {
      case FRAME_COLLECTION: {
        const descriptor = BSON.deserialize(
          frame.payload,
          DECODE
        ) as unknown as CollectionDescriptor;
        // The same payload decoded to plain numbers gives comparable index signatures.
        const plain = BSON.deserialize(frame.payload) as unknown as CollectionDescriptor;
        const existing = live.get(descriptor.name) ?? null;
        const options = JSON.stringify(plain.options ?? {});
        seen.add(descriptor.name);
        collections += 1;
        currentCount = 0;
        if (existing && existing.options === options) {
          await db.collection(descriptor.name).deleteMany({}, { writeConcern: RESTORE_WRITE });
          current = {
            ...descriptor,
            reused: existing,
            signatures: plain.indexes.map(indexSignature),
          };
        } else {
          // Different options (or a collection the world did not have): rebuild it.
          if (existing) await db.dropCollection(descriptor.name);
          // Options (capped, validators) must exist before the first insert.
          // Plain collections are created by their first insert, which costs a
          // fraction of an explicit create.
          if (Object.keys(plain.options ?? {}).length > 0)
            await db.createCollection(descriptor.name, {
              ...descriptor.options,
              writeConcern: RESTORE_WRITE,
            });
          current = { ...descriptor, reused: null, signatures: plain.indexes.map(indexSignature) };
        }
        break;
      }
      case FRAME_DOCUMENT:
        batch.push(BSON.deserialize(frame.payload, DECODE));
        batchBytes += frame.payload.length;
        documents += 1;
        currentCount += 1;
        if (batch.length >= INSERT_BATCH_DOCS || batchBytes >= INSERT_BATCH_BYTES) await flush();
        break;
      case FRAME_COLLECTION_END: {
        await flush();
        const done = current;
        const empty = currentCount === 0;
        current = null;
        if (!done) break;
        // Indexes the live collection already has, with the same definition, stay.
        const wanted = done.indexes.filter(
          (index, position) =>
            done.reused?.indexes.get(String(index.name)) !== done.signatures[position]
        );
        const stale = [...(done.reused?.indexes.keys() ?? [])].filter(
          (name) => !done.indexes.some((index) => String(index.name) === name)
        );
        const changed = [...(done.reused?.indexes.keys() ?? [])].filter((name) =>
          wanted.some((index) => String(index.name) === name)
        );
        await later(async () => {
          for (const name of [...stale, ...changed]) await db.collection(done.name).dropIndex(name);
          if (wanted.length > 0) {
            // Built after the documents: once is far cheaper than per insert.
            await db.command({
              createIndexes: done.name,
              indexes: wanted.map(indexSpec),
              writeConcern: RESTORE_WRITE,
            });
          } else if (empty && !done.reused && Object.keys(done.options ?? {}).length === 0) {
            await db.createCollection(done.name, { writeConcern: RESTORE_WRITE });
          }
        });
        break;
      }
      default:
        break;
    }
  }
  await Promise.all(inflight);
  if (failure) throw failure;
  // Collections the save does not have belong to a different build of the game.
  for (const name of live.keys()) if (!seen.has(name)) await db.dropCollection(name);
  // One flush for everything above, instead of one per write.
  await db.admin().command({ fsync: 1 });
  return { collections, documents };
}
