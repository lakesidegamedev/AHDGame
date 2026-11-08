import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Character } from "@/lib/db/types";

vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/gameState", () => ({
  getGameState: vi.fn().mockResolvedValue({ _id: "current", currentTurn: 200 }),
}));
vi.mock("@/lib/time/gameTime", () => ({
  getGameTime: vi
    .fn()
    .mockResolvedValue({ currentTurn: 200, effectiveNow: new Date("2027-06-01T00:00:00Z") }),
}));
vi.mock("@/lib/financialTxLog/atomicCashGuard", () => ({
  atomicallyDebitCharacterCash: vi.fn(),
  refundCharacterCash: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn() }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/wireEvent", () => ({
  logWireEvent: vi.fn(),
  wireHeadlineCorpFounded: vi.fn().mockReturnValue("headline"),
  wireHeadlineCorpIpo: vi.fn().mockReturnValue("ipo headline"),
}));

import {
  atomicallyDebitCharacterCash,
  refundCharacterCash,
} from "@/lib/financialTxLog/atomicCashGuard";
import { recordAudit } from "@/lib/audit/recordAudit";
import { foundCorporation } from "./foundCorporation";

function makeDb(insertOne: ReturnType<typeof vi.fn>) {
  const writes: string[] = [];
  const corporations = {
    findOne: vi.fn().mockResolvedValue(null),
    insertOne: vi.fn(async (doc: unknown) => {
      writes.push("corporations.insertOne");
      return insertOne(doc);
    }),
    updateOne: vi.fn(async () => {
      writes.push("corporations.updateOne");
      return { matchedCount: 1, modifiedCount: 1 };
    }),
    deleteOne: vi.fn(async () => {
      writes.push("corporations.deleteOne");
      return { deletedCount: 1 };
    }),
  };
  const ceoVotes = {
    insertOne: vi.fn(async () => {
      writes.push("corporationCeoVotes.insertOne");
      return { acknowledged: true };
    }),
    deleteMany: vi.fn(async () => {
      writes.push("corporationCeoVotes.deleteMany");
      return { deletedCount: 0 };
    }),
  };
  const characters = {
    updateOne: vi.fn(async () => {
      writes.push("characters.updateOne");
      return { modifiedCount: 1 };
    }),
  };
  const db = {
    collection: vi.fn((name: string) => {
      if (name === "gameState") {
        return { findOne: async () => ({ _id: "current", currentYear: 2027 }) };
      }
      if (name === "federalBudget") {
        return { find: () => ({ toArray: async () => [] }), findOne: async () => null };
      }
      if (name === "exchangeRates") return { find: () => ({ toArray: async () => [] }) };
      if (name === "users") return { findOne: vi.fn().mockResolvedValue(null) };
      if (name === "counters") return { findOneAndUpdate: vi.fn().mockResolvedValue({ seq: 7 }) };
      if (name === "states") return { findOne: vi.fn().mockResolvedValue({ name: "California" }) };
      if (name === "corporations") return corporations;
      if (name === "corporationCeoVotes") return ceoVotes;
      if (name === "characters") return characters;
      return {
        findOne: vi.fn().mockResolvedValue(null),
        insertOne: vi.fn().mockResolvedValue({ acknowledged: true }),
        updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      };
    }),
  };
  return { db, writes, corporations, ceoVotes };
}

function makeCharacter(): Character {
  return {
    _id: new ObjectId(),
    name: "Founder",
    countryId: "US",
    homeState: "CA",
    cashOnHand: 1_000_000_000,
  } as unknown as Character;
}

const request = {
  name: "Example Works",
  tickerSymbol: "EXWK",
  type: "manufacturing",
} as const;

describe("foundCorporation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(atomicallyDebitCharacterCash).mockResolvedValue({ ok: true } as never);
  });

  it("debits the founder, inserts a private corporation and returns 201", async () => {
    const insertedId = new ObjectId();
    const { db, writes, corporations } = makeDb(vi.fn().mockResolvedValue({ insertedId }));
    const character = makeCharacter();
    const userId = new ObjectId().toString();

    const result = await foundCorporation({
      db: db as never,
      userId,
      character,
      request: request as never,
    });

    expect(result).toEqual({
      ok: true,
      status: 201,
      body: {
        corporationId: insertedId.toString(),
        sequentialId: expect.any(Number),
        message: "Example Works has been founded!",
      },
    });
    const debit = vi.mocked(atomicallyDebitCharacterCash).mock.calls[0]!;
    expect(debit[1]).toEqual(character._id);
    const debitedAmount = debit[3];
    expect(debitedAmount).toBeGreaterThan(0);
    expect(writes).toEqual([
      "corporations.insertOne",
      "corporations.updateOne",
      "corporations.updateOne",
      "characters.updateOne",
      "corporationCeoVotes.insertOne",
    ]);
    const inserted = corporations.insertOne.mock.calls[0]![0] as {
      isPrivate: boolean;
      userId: ObjectId;
      ceoType: string;
      tickerSymbol: string;
    };
    expect(inserted.isPrivate).toBe(true);
    expect(inserted.userId.toString()).toBe(userId);
    expect(inserted.ceoType).toBe("character");
    expect(inserted.tickerSymbol).toBe("EXWK");
    expect(refundCharacterCash).not.toHaveBeenCalled();
    expect(vi.mocked(recordAudit).mock.calls[0]![0]).toMatchObject({
      action: "corp.found",
      amount: -debitedAmount,
    });
  });

  it("refunds the founder and returns 400 when a concurrent founder wins the ticker", async () => {
    const duplicate = Object.assign(new Error("E11000 duplicate key tickerSymbol_1"), {
      code: 11000,
    });
    const { db, writes } = makeDb(vi.fn().mockRejectedValue(duplicate));
    const character = makeCharacter();

    const result = await foundCorporation({
      db: db as never,
      userId: new ObjectId().toString(),
      character,
      request: request as never,
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "That ticker symbol is already taken",
    });
    const debitedAmount = vi.mocked(atomicallyDebitCharacterCash).mock.calls[0]![3];
    expect(refundCharacterCash).toHaveBeenCalledWith(
      db,
      character._id,
      "USD",
      debitedAmount,
      false
    );
    expect(writes).toEqual(["corporations.insertOne"]);
  });

  it("removes the corporation, refunds and rethrows when a later write fails", async () => {
    const insertedId = new ObjectId();
    const { db, writes, ceoVotes } = makeDb(vi.fn().mockResolvedValue({ insertedId }));
    ceoVotes.insertOne.mockRejectedValueOnce(new Error("vote write failed"));
    const character = makeCharacter();

    await expect(
      foundCorporation({
        db: db as never,
        userId: new ObjectId().toString(),
        character,
        request: request as never,
      })
    ).rejects.toThrow("vote write failed");

    expect(writes).toContain("corporationCeoVotes.deleteMany");
    expect(writes).toContain("corporations.deleteOne");
    expect(refundCharacterCash).toHaveBeenCalledTimes(1);
  });

  it("does not insert when the atomic debit fails", async () => {
    vi.mocked(atomicallyDebitCharacterCash).mockResolvedValue({ ok: false } as never);
    const { db, writes } = makeDb(vi.fn());

    const result = await foundCorporation({
      db: db as never,
      userId: new ObjectId().toString(),
      character: makeCharacter(),
      request: request as never,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ status: 400 });
    expect(writes).toEqual([]);
    expect(refundCharacterCash).not.toHaveBeenCalled();
  });

  it("rejects a secondary sector equal to the primary before any write", async () => {
    const { db, writes } = makeDb(vi.fn());

    const result = await foundCorporation({
      db: db as never,
      userId: new ObjectId().toString(),
      character: makeCharacter(),
      request: { ...request, secondaryType: "manufacturing" } as never,
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Secondary sector must be different from the primary sector",
    });
    expect(writes).toEqual([]);
    expect(atomicallyDebitCharacterCash).not.toHaveBeenCalled();
  });
});
