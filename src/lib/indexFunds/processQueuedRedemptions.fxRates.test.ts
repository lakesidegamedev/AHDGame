/**
 * The pass-level rate read must keep the currency it keys the map by (#5083).
 *
 * Queued payouts stopped for every fund while the index-funds phase kept
 * completing: `prepareQueuedRedemptionPass` read `exchangeRates` with a
 * projection of `{ rate: 1 }`, so the driver returned rows without
 * `currencyCode` and the map was keyed by `undefined`. Every fund then failed
 * the "rate available" gate in `processQueuedRedemptions`, which only
 * `console.warn`s, so no queue row was ever claimed.
 *
 * `createInMemoryDb` ignores a `find` projection, which is exactly why the
 * existing pass tests stayed green; the db below applies the projection the way
 * the driver does.
 */
import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { IndexFund, IndexFundRedemptionQueueEntry } from "@/lib/db/types";
import { prepareQueuedRedemptionPass, processQueuedRedemptions } from "./processQueuedRedemptions";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

const T0 = new Date("2000-01-01T00:00:00Z");
const TURN = 495;

type Doc = Record<string, unknown>;

/** Mongo find semantics: only the projected fields (and _id) come back. */
function applyProjection(doc: Doc, projection: Doc): Doc {
  const included = Object.entries(projection)
    .filter(([, value]) => value === 1)
    .map(([field]) => field);
  if (included.length === 0) return doc;
  const projected: Doc = { _id: doc._id };
  for (const field of included) if (field in doc) projected[field] = doc[field];
  return projected;
}

/** A db whose `find(filter, { projection })` projects like the real driver. */
function projectingDb(db: Db): Db {
  return {
    collection: (name: string) => {
      const collection = db.collection(name);
      return new Proxy(collection, {
        get(target, property, receiver) {
          if (property !== "find") return Reflect.get(target, property, receiver);
          return (filter: Doc = {}, options?: { projection?: Doc }) => {
            const cursor = target.find(filter);
            if (!options?.projection) return cursor;
            return {
              sort: (spec: Record<string, number>) => cursor.sort(spec),
              toArray: async () =>
                (await cursor.toArray()).map((doc) =>
                  applyProjection(doc as Doc, options.projection!)
                ),
            };
          };
        },
      });
    },
  } as unknown as Db;
}

function world(rates: { currencyCode: string; rate: number }[]) {
  const memory = createInMemoryDb();
  const fundId = new ObjectId();
  const nppId = new ObjectId();
  const fund: IndexFund = {
    _id: fundId,
    slug: "de-top-25",
    name: "Germany Top 25",
    tickerSymbol: "DE25",
    scope: "country",
    kind: "broad",
    countryId: "DE",
    anchorCurrencyCode: "EUR",
    status: "active",
    quotedNav: 229.6634,
    unitSupply: 1_131_265,
    reserveUnits: 0,
    cashAnchor: 131_160_843,
    targetConstituents: [],
    holdings: [],
    createdAt: T0,
    updatedAt: T0,
  } as IndexFund;
  const entry: IndexFundRedemptionQueueEntry = {
    _id: new ObjectId(),
    fundId,
    holderKind: "npp",
    nppId,
    units: 1,
    requestedNavAnchor: 229.6634,
    requestedAmountAnchor: 229.6634,
    paidAmountAnchor: 0,
    status: "queued",
    unitsBurnedAtRequest: true,
    createdAt: T0,
    updatedAt: T0,
  };
  memory.seed("indexFunds", [{ ...fund }]);
  memory.seed("indexFundRedemptionQueue", [{ ...entry }]);
  memory.seed("npps", [
    { _id: nppId, countryId: "DE", name: "Sophie Friedrich", nppInvestmentCashAnchor: 0 },
  ]);
  memory.seed(
    "exchangeRates",
    rates.map((rate) => ({ ...rate }))
  );
  memory.seed("gameConfig", [{ _id: "default", ledgerShadow: true }]);
  memory.seed("gameState", [{ _id: "current", currentTurn: TURN - 1 }]);
  return { memory, db: memory as unknown as Db, fund, entry };
}

async function queueRow(db: Db, id: ObjectId) {
  return db
    .collection<IndexFundRedemptionQueueEntry>("indexFundRedemptionQueue")
    .findOne({ _id: id });
}

describe("queued redemption pass rate lookup", () => {
  it("marks a fund's currency rate available when a rate row exists", async () => {
    const w = world([{ currencyCode: "EUR", rate: 0.75597 }]);
    const context = await prepareQueuedRedemptionPass(projectingDb(w.db), [w.fund], true);
    expect(context.fxRateByCurrency.get("EUR")).toEqual({ rate: 0.75597, ok: true });
  });

  it("claims and pays the queue row through the pass context", async () => {
    const w = world([{ currencyCode: "EUR", rate: 0.75597 }]);
    const db = projectingDb(w.db);
    const context = await prepareQueuedRedemptionPass(db, [w.fund], true);
    const paid = await processQueuedRedemptions(
      db,
      w.fund,
      true,
      TURN,
      true,
      { claimsLeft: 10 },
      context
    );
    expect(paid).toBe(1);
    const row = await queueRow(db, w.entry._id);
    expect(row!.status).toBe("paid");
    expect(row!.updatedAt!.getTime()).toBeGreaterThan(w.entry.createdAt!.getTime());
  });

  it("still defers when no rate row covers the fund's currency", async () => {
    const w = world([{ currencyCode: "USD", rate: 1 }]);
    const db = projectingDb(w.db);
    const context = await prepareQueuedRedemptionPass(db, [w.fund], true);
    expect(context.fxRateByCurrency.get("EUR")).toEqual({ rate: 1, ok: false });
    const paid = await processQueuedRedemptions(
      db,
      w.fund,
      true,
      TURN,
      true,
      { claimsLeft: 10 },
      context
    );
    expect(paid).toBe(0);
    const row = await queueRow(db, w.entry._id);
    expect(row!.status).toBe("queued");
    expect(row!.updatedAt!.getTime()).toBe(w.entry.createdAt!.getTime());
  });

  it("pays without a rate read when forex is disabled", async () => {
    const w = world([{ currencyCode: "EUR", rate: 0.75597 }]);
    const db = projectingDb(w.db);
    const paid = await processQueuedRedemptions(db, w.fund, false, TURN, true, { claimsLeft: 10 });
    expect(paid).toBe(1);
    const row = await queueRow(db, w.entry._id);
    expect(row!.status).toBe("paid");
  });
});
