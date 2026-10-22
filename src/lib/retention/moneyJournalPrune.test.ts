import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { MONEY_JOURNAL_RETENTION_TURNS, pruneMoneyJournals } from "./moneyJournalPrune";

const CURRENT_TURN = 400;
const OLD = CURRENT_TURN - MONEY_JOURNAL_RETENTION_TURNS - 1;
const RECENT = CURRENT_TURN - MONEY_JOURNAL_RETENTION_TURNS;

let db: Db;

async function ids(collection: string): Promise<string[]> {
  const rows = await db.collection(collection).find({}).toArray();
  return rows.map((row) => String(row._id)).sort();
}

beforeEach(async () => {
  db = createInMemoryDb() as unknown as Db;
  await db
    .collection<{ _id: string }>("gameState")
    .insertOne({ _id: "current", currentTurn: CURRENT_TURN, isProcessing: false } as never);
});

describe("pruneMoneyJournals", () => {
  it("deletes ledger entries older than the window and keeps the window", async () => {
    await db.collection("ledgerEntries").insertMany([
      { _id: "old", turn: OLD },
      { _id: "edge", turn: RECENT },
      { _id: "new", turn: CURRENT_TURN },
    ] as never);

    const result = await pruneMoneyJournals(db);

    expect(result).toMatchObject({ cutoff: RECENT, ledgerEntries: 1 });
    expect(await ids("ledgerEntries")).toEqual(["edge", "new"]);
  });

  it("deletes only terminal, fully projected moves of allowlisted kinds", async () => {
    const kind = "manufacturing.product.advertising";
    await db.collection("bankMoneyMoves").insertMany([
      { _id: "applied", kind, status: "applied", turn: OLD },
      { _id: "rejected", kind, status: "rejected", turn: OLD },
      {
        _id: "projected",
        kind,
        status: "applied",
        turn: OLD,
        projections: [{ collection: "ledgerEntries" }],
        projectionsCompletedAt: new Date(),
      },
      { _id: "recent", kind, status: "applied", turn: RECENT },
      { _id: "partial", kind, status: "partial", turn: OLD },
      {
        _id: "unfinished",
        kind,
        status: "applied",
        turn: OLD,
        projections: [{ collection: "ledgerEntries" }],
      },
      {
        _id: "recovery",
        kind,
        status: "applied",
        turn: OLD,
        treasuryReserveRecoveryPending: true,
      },
      { _id: "media-order", kind: "political-media-order", status: "applied", turn: OLD },
      { _id: "sovereign", kind: "sovereign_maturity_payout", status: "applied", turn: OLD },
    ] as never);

    const result = await pruneMoneyJournals(db);

    expect(result.bankMoneyMoves).toBe(3);
    expect(await ids("bankMoneyMoves")).toEqual([
      "media-order",
      "partial",
      "recent",
      "recovery",
      "sovereign",
      "unfinished",
    ]);
  });

  it("skips while a turn holds the processing lock", async () => {
    await db
      .collection<{ _id: string }>("gameState")
      .updateOne({ _id: "current" }, { $set: { isProcessing: true } });
    await db.collection("ledgerEntries").insertOne({ _id: "old", turn: OLD } as never);

    const result = await pruneMoneyJournals(db);

    expect(result.skipped).toBe("turn-processing");
    expect(await ids("ledgerEntries")).toEqual(["old"]);
  });

  it("clears a bounded number of backlog turns per run", async () => {
    await db.collection("ledgerEntries").insertMany(
      [OLD - 4, OLD - 3, OLD - 2, OLD - 1, OLD].map((turn) => ({
        _id: `t${turn}`,
        turn,
      })) as never
    );

    const first = await pruneMoneyJournals(db, { turnsPerRun: 2 });
    expect(first.ledgerEntries).toBe(2);
    expect(await ids("ledgerEntries")).toEqual([`t${OLD - 2}`, `t${OLD - 1}`, `t${OLD}`]);

    await pruneMoneyJournals(db, { turnsPerRun: 2 });
    await pruneMoneyJournals(db, { turnsPerRun: 2 });
    expect(await ids("ledgerEntries")).toEqual([]);
  });

  it("does nothing before the world is older than the window", async () => {
    await db
      .collection<{ _id: string }>("gameState")
      .updateOne({ _id: "current" }, { $set: { currentTurn: 10 } });
    await db.collection("ledgerEntries").insertOne({ _id: "early", turn: 1 } as never);

    const result = await pruneMoneyJournals(db);

    expect(result.ledgerEntries).toBe(0);
    expect(await ids("ledgerEntries")).toEqual(["early"]);
  });
});
