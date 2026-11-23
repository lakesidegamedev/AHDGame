import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { encodeReceipt, stageReceiptChunks } from "@/lib/market/producerMarket/receiptStorage";
import { settleProducerMarket } from "@/lib/market/producerMarket/rules";
import { loadCompanySupplyChain, marketParty } from "./query";
const company = new ObjectId("111111111111111111111111");
const seller = new ObjectId("222222222222222222222222");
const wallet = JSON.stringify(["world", "households", "CA", "CA_ON", "CAD"]);
const site = (id: string, side: string) => JSON.stringify([id, side, "food"]);
async function setup() {
  const db = createInMemoryDb();
  await db
    .collection("gameState")
    .insertOne({ _id: "current", worldEpochId: "world", currentTurn: 4 });
  await db.collection("corporateSectors").insertOne({
    _id: new ObjectId("333333333333333333333333"),
    corporationId: company,
    countryId: "US",
    stateId: "AZ",
    sectorType: "manufacturing",
  });
  await db
    .collection("corporations")
    .insertOne({ _id: seller, name: "Example Foods", sequentialId: 7 });
  await db.collection("states").insertMany([
    { _id: "CT", name: "Connecticut" },
    { _id: "CA_ON", name: "Ontario" },
    { _id: "AZ", name: "Arizona" },
  ]);
  const market = settleProducerMarket({
    turn: 4,
    accounts: [
      { id: company.toString(), cash: 100 },
      { id: seller.toString(), cash: 0 },
      { id: wallet, cash: 100 },
    ],
    offers: [
      {
        id: site("supplier", "output"),
        accountId: seller.toString(),
        commodity: "energy",
        book: "energy",
        units: 10,
        unitPrice: 2,
        countryId: "US",
        stateId: "CT",
      },
      {
        id: site("own", "output"),
        accountId: company.toString(),
        commodity: "food",
        book: "world",
        units: 5,
        unitPrice: 3,
        countryId: "CA",
        stateId: "CA_ON",
      },
    ],
    orders: [
      {
        id: site("own", "input"),
        accountId: company.toString(),
        commodity: "energy",
        book: "energy",
        units: 2,
        maximumUnitPrice: 2,
        priority: 1,
        countryId: "CA",
        stateId: "CA_ON",
      },
      {
        id: site("households", "input"),
        accountId: wallet,
        commodity: "food",
        book: "world",
        units: 20,
        maximumUnitPrice: 3,
        countryId: "CA",
        stateId: "CA_ON",
      },
    ],
  });
  const frozen = {
    version: 1,
    worldEpoch: "world",
    createdAt: "2026-11-17T12:00:00.000Z",
    request: { turn: 4 },
    targets: [
      {
        producerId: "own",
        corporationId: company.toString(),
        plantType: { sectorType: "agriculture" },
      },
    ],
    result: { tradeReceipt: market.tradeReceipt },
  };
  const encoded = encodeReceipt(frozen);
  await stageReceiptChunks(db as never, encoded.chunks);
  const turns = db.collection("producerEconomyTurns");
  await turns.insertOne({
    _id: "world:4",
    worldEpoch: "world",
    turn: 4,
    status: "settled",
    digest: encoded.digest,
    payload: encoded.payload,
  });
  const read = vi
    .spyOn(turns, "findOne")
    .mockImplementation(
      async (filter = {}) =>
        (await turns.find(filter).sort({ turn: -1 }).limit(1).toArray())[0] ?? null
    );
  return { db, turns, read, frozen };
}
describe("company supply-chain receipt query", () => {
  it("hydrates actual counterparties and frozen sites with batched reads, then caches the immutable receipt", async () => {
    const { db, read } = await setup();
    const sectors = vi.spyOn(db.collection("corporateSectors"), "find");
    const result = await loadCompanySupplyChain(db as never, company.toString());
    expect(result.turn).toBe(4);
    expect(result.sites).toContainEqual({
      id: "own",
      countryId: "CA",
      stateId: "CA_ON",
      sectorType: "agriculture",
    });
    expect(result.sites.some((s) => s.stateId === "AZ")).toBe(true);
    expect(result.parties).toContainEqual({
      id: seller.toString(),
      name: "Example Foods",
      kind: "corporation",
      href: "/corporation/7",
    });
    expect(result.parties).toContainEqual({ id: wallet, name: "Households", kind: "households" });
    expect(result.states.CA_ON).toBe("Ontario");
    expect(result.flows.some((f) => f.mode === "open-market" && f.direction === "suppliers")).toBe(
      true
    );
    expect(sectors).toHaveBeenCalledTimes(1);
    expect(sectors.mock.calls[0][0]).toEqual({ corporationId: company });
    expect(await loadCompanySupplyChain(db as never, company.toString())).toBe(result);
    expect(sectors).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledTimes(3);
    expect(read.mock.calls[0][0]).toEqual({
      worldEpoch: "world",
      status: "settled",
      turn: { $lte: 4 },
    });
  });
  it("shows a sector added or removed after the receipt was cached", async () => {
    const { db } = await setup();
    const before = await loadCompanySupplyChain(db as never, company.toString());
    expect(before.sites.some((s) => s.stateId === "CT")).toBe(false);
    await db.collection("corporateSectors").insertOne({
      _id: new ObjectId("444444444444444444444444"),
      corporationId: company,
      countryId: "US",
      stateId: "CT",
      sectorType: "manufacturing",
    });
    const after = await loadCompanySupplyChain(db as never, company.toString());
    expect(after.sites.some((s) => s.stateId === "CT")).toBe(true);
    await db
      .collection("corporateSectors")
      .deleteOne({ _id: new ObjectId("333333333333333333333333") });
    const removed = await loadCompanySupplyChain(db as never, company.toString());
    expect(removed.sites.some((s) => s.stateId === "AZ")).toBe(false);
  });
  it("ignores unfinished and future turns and the old world's receipts", async () => {
    const { db, turns } = await setup();
    await turns.insertMany([
      { _id: "world:5", worldEpoch: "world", turn: 5, status: "settled", digest: "future" },
      { _id: "frozen", worldEpoch: "world", turn: 4, status: "frozen", digest: "not-settled" },
      { _id: "old", worldEpoch: "old", turn: 20, status: "settled", digest: "old" },
    ]);
    expect((await loadCompanySupplyChain(db as never, company.toString())).turn).toBe(4);
    await db
      .collection("gameState")
      .updateOne({ _id: "current" }, { $set: { worldEpochId: "reset", currentTurn: 0 } });
    expect(await loadCompanySupplyChain(db as never, company.toString())).toMatchObject({
      turn: null,
      flows: [],
    });
  });
  it("rejects a receipt with a mismatched frozen identity", async () => {
    const { db, turns, frozen } = await setup();
    const encoded = encodeReceipt({ ...frozen, worldEpoch: "wrong" });
    await turns.updateOne(
      { _id: "world:4" },
      { $set: { payload: encoded.payload, digest: encoded.digest } }
    );
    await expect(loadCompanySupplyChain(db as never, company.toString())).rejects.toThrow(
      "Invalid supply-chain receipt"
    );
  });
  it("returns an empty view before a world exists", async () => {
    expect(
      (await loadCompanySupplyChain(createInMemoryDb() as never, company.toString())).turn
    ).toBeNull();
  });
  it("labels non-company participants without exposing raw wallet ids", () => {
    expect(marketParty(JSON.stringify(["w", "publicBuyer", "US"])).name).toBe(
      "Government procurement"
    );
    expect(marketParty(JSON.stringify(["w", "investmentBuyer", "US"])).name).toBe(
      "Construction and investment"
    );
    expect(marketParty(seller.toString()).name).toBe("Former corporation");
  });
});
