import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Character } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { foundCorporation } from "./foundCorporation";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => false }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/wireEvent", () => ({
  logWireEvent: vi.fn(),
  wireHeadlineCorpFounded: () => "Founded",
  wireHeadlineCorpIpo: () => "Listed",
}));
function fixture(cashOnHand = 1e9) {
  const f = createTransactionalMemoryDb(),
    userId = new ObjectId().toHexString();
  const character = {
    _id: new ObjectId(),
    name: "Synthetic founder",
    countryId: "US",
    homeState: "CA",
    cashOnHand,
  } as Character;
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 200, currentYear: 2027, worldEpochId: "synthetic" },
  ]);
  f.memory.seed("characters", [{ ...character }]);
  f.memory.seed("states", [{ _id: "CA", countryId: "US", name: "California" }]);
  const input = {
    db: f.db,
    character,
    userId,
    request: { name: "Synthetic Works", tickerSymbol: "SYNW", type: "manufacturing" as const },
  };
  return { ...f, input };
}
describe("foundCorporation", () => {
  it("debits the founder and inserts a private corporation with its ownership", async () => {
    const f = fixture(),
      reply = await foundCorporation(f.input);
    expect(reply).toMatchObject({ ok: true, status: 201 });
    const corp = await f.db.collection("corporations").findOne({ tickerSymbol: "SYNW" });
    expect(corp).toMatchObject({
      isPrivate: true,
      ceoId: f.input.character._id,
      ceoType: "character",
    });
    expect(
      (await f.db.collection("characters").findOne({ _id: f.input.character._id }))!.cashOnHand
    ).toBeLessThan(1e9);
    expect(await f.db.collection("corporationCeoVotes").countDocuments({})).toBe(1);
  });
  it("rolls back the debit when a concurrent founder wins the ticker", async () => {
    const f = fixture();
    vi.spyOn(f.memory.collection("corporations"), "insertOne").mockRejectedValueOnce(
      Object.assign(new Error("E11000 duplicate key tickerSymbol_1"), { code: 11000 })
    );
    expect(await foundCorporation(f.input)).toMatchObject({
      ok: false,
      status: 400,
      error: "That ticker symbol is already taken",
    });
    expect(
      (await f.db.collection("characters").findOne({ _id: f.input.character._id }))!.cashOnHand
    ).toBe(1e9);
    expect(await f.db.collection("corporations").countDocuments({})).toBe(0);
  });
  it("rolls back every landed write when a later write fails", async () => {
    const f = fixture(),
      fault = withInjectedCrash(f.memory, {
        collection: "corporationCeoVotes",
        op: "insertOne",
        onCall: 1,
        afterWrite: true,
      });
    await expect(foundCorporation({ ...f.input, db: fault.db })).rejects.toThrow();
    expect(
      (await f.db.collection("characters").findOne({ _id: f.input.character._id }))!.cashOnHand
    ).toBe(1e9);
    expect(await f.db.collection("corporations").countDocuments({})).toBe(0);
    expect(await f.db.collection("corporationCeoVotes").countDocuments({})).toBe(0);
  });
  it("does not insert when fresh founder cash is insufficient", async () => {
    const f = fixture(0);
    expect(
      await foundCorporation({ ...f.input, character: { ...f.input.character, cashOnHand: 1e9 } })
    ).toMatchObject({ ok: false, status: 400 });
    expect(await f.db.collection("corporations").countDocuments({})).toBe(0);
  });
  it("lets a second character on the same account found a corporation", async () => {
    const f = fixture();
    f.memory.seed("corporations", [
      {
        _id: new ObjectId(),
        userId: new ObjectId(f.input.userId),
        ceoId: new ObjectId(),
        ceoType: "character",
        tickerSymbol: "OTHER",
      },
    ]);
    expect(await foundCorporation(f.input)).toMatchObject({ ok: true, status: 201 });
    expect(await f.db.collection("corporations").countDocuments({})).toBe(2);
  });
  it("rejects a character that already owns a corporation", async () => {
    const f = fixture();
    f.memory.seed("corporations", [
      { _id: new ObjectId(), ceoId: f.input.character._id, ceoType: "character" },
    ]);
    expect(await foundCorporation(f.input)).toMatchObject({
      ok: false,
      status: 400,
      error: "This character already owns a corporation.",
    });
    expect(
      (await f.db.collection("characters").findOne({ _id: f.input.character._id }))!.cashOnHand
    ).toBe(1e9);
  });
  it("rejects identical primary and secondary sectors without charging", async () => {
    const f = fixture();
    expect(
      await foundCorporation({
        ...f.input,
        request: { ...f.input.request, secondaryType: "manufacturing" },
      })
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      (await f.db.collection("characters").findOne({ _id: f.input.character._id }))!.cashOnHand
    ).toBe(1e9);
    expect(await f.db.collection("corporations").countDocuments({})).toBe(0);
  });
});
