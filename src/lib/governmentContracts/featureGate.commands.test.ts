import { beforeEach, describe, it, expect, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import type { AuthUserWithCharacter } from "@/lib/auth";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { publishTender, submitBid, awardTender, cancelTender } from "./commands";
import { acceptContractOffer } from "@/lib/extraction/commands/acceptContractOffer";
import type { GovernmentTender } from "./types";
import { GOVERNMENT_CONTRACTS_DISABLED_MESSAGE as message } from "./rules/featureGate";
vi.mock("@/lib/notifications", () => ({ createNotifications: vi.fn() }));
const government = { isAdmin: true, userId: new ObjectId().toHexString() } as AuthUserWithCharacter;
const owner = new ObjectId(),
  corporationId = new ObjectId();
const ceo = { userId: owner.toHexString() } as AuthUserWithCharacter;
const now = new Date("2026-10-30T12:00:00Z");
let db: Db;
function tender(countryId: "US" | "UK" | "JP" = "US"): GovernmentTender {
  return {
    _id: new ObjectId().toHexString(),
    countryId,
    title: "Synthetic tender",
    description: "Synthetic test contract",
    terms: {
      type: "extraction",
      stateId: "TX",
      resource: "oil",
      share: 0.1,
      termTurns: 24,
      royaltyRatePerTurn: 0.01,
      minimumSigningFeeAnchor: 0,
    },
    issuerLevel: "national",
    publishedBy: government.userId,
    publishedTurn: 1,
    closesTurn: 10,
    awardDeadlineTurn: 34,
    status: "open",
    bids: {},
    revision: 0,
    contractId: new ObjectId().toHexString(),
    reservedAmount: 0,
    updatedAt: now,
  };
}
beforeEach(async () => {
  db = createInMemoryDb() as unknown as Db;
  await db.collection("gameConfig").insertOne({
    _id: "default" as never,
    governmentContractsEnabled: false,
    contractIssuanceEnabled: true,
  });
});
describe("government contract server enforcement", () => {
  it.each(["US", "UK", "JP"] as const)("blocks new activity in %s", async (countryId) => {
    const t = tender(countryId);
    for (const terms of [
      t.terms,
      {
        type: "defence" as const,
        component: "ground" as const,
        lots: 1,
        grade: 0,
        maximumPricePerLot: 100,
      },
    ]) {
      await expect(
        publishTender(
          db,
          countryId,
          { title: t.title, description: t.description, terms, biddingTurns: 6 },
          government,
          1,
          now
        )
      ).rejects.toMatchObject({ message, status: 503 });
    }
    await expect(
      submitBid(
        db,
        t,
        { corporationId: corporationId.toHexString(), amount: 100, expectedRevision: 0 },
        ceo,
        5,
        now
      )
    ).rejects.toMatchObject({ message, status: 503 });
    await db.collection("governmentTenders").insertOne(t as never);
    await expect(
      awardTender(db, t, corporationId.toHexString(), "Synthetic award reason", government, 11, now)
    ).rejects.toMatchObject({ message, status: 503 });
    expect(await db.collection("extractionContracts").countDocuments({})).toBe(0);
    expect(await db.collection("defenceContracts").countDocuments({})).toBe(0);
    expect(
      (await db.collection("governmentTenders").findOne({ _id: t._id as never }))?.status
    ).toBe("open");
  });
  it("does not create a new concession when an unfinished award resumes while disabled", async () => {
    const t = tender(),
      id = corporationId.toHexString();
    t.status = "awarding";
    t.winningCorporationId = id;
    t.awardAttemptId = new ObjectId().toHexString();
    t.bids[id] = {
      corporationId: id,
      corporationName: "Synthetic supplier",
      userId: ceo.userId,
      amount: 100,
      submittedTurn: 2,
      revision: 1,
      withdrawn: false,
    };
    await db.collection("governmentTenders").insertOne(t as never);
    await expect(
      awardTender(db, t, id, "Synthetic award reason", government, 11, now)
    ).rejects.toMatchObject({ message, status: 503 });
    expect(await db.collection("extractionContracts").countDocuments({})).toBe(0);
    expect(await db.collection("bankMoneyMoves").countDocuments({})).toBe(0);
  });
  it("returns an already completed award without creating another contract while disabled", async () => {
    const t = tender(),
      id = corporationId.toHexString();
    t.status = "awarded";
    t.winningCorporationId = id;
    await db.collection("governmentTenders").insertOne(t as never);
    expect(await awardTender(db, t, id, "Synthetic award reason", government, 11, now)).toBe(
      t.contractId
    );
    expect(await db.collection("extractionContracts").countDocuments({})).toBe(0);
    expect(await db.collection("bankMoneyMoves").countDocuments({})).toBe(0);
  });
  it("allows an existing bid to be withdrawn while disabled", async () => {
    const t = tender(),
      id = corporationId.toHexString();
    t.bids[id] = {
      corporationId: id,
      corporationName: "Synthetic supplier",
      userId: ceo.userId,
      amount: 100,
      submittedTurn: 2,
      revision: 1,
      withdrawn: false,
    };
    await db.collection("governmentTenders").insertOne(t as never);
    await db
      .collection("corporations")
      .insertOne({ _id: corporationId, userId: owner, name: "Synthetic supplier" });
    await submitBid(
      db,
      t,
      { corporationId: id, amount: 100, expectedRevision: 1, withdraw: true },
      ceo,
      5,
      now
    );
    const saved = await db.collection("governmentTenders").findOne({ _id: t._id as never });
    expect(saved?.bids[id].withdrawn).toBe(true);
  });
  it("allows canceling a pending tender while disabled", async () => {
    const t = tender();
    await db.collection("governmentTenders").insertOne(t as never);
    await cancelTender(db, t, "Synthetic cancellation reason", government, 5);
    expect(
      (await db.collection("governmentTenders").findOne({ _id: t._id as never }))?.status
    ).toBe("canceled");
  });
  it("blocks accepting a legacy extraction offer before any payment", async () => {
    const result = await acceptContractOffer(
      db,
      { status: "offered" } as never,
      {} as never,
      5,
      now
    );
    expect(result).toEqual({ ok: false, status: 503, error: message });
    expect(await db.collection("bankMoneyMoves").countDocuments({})).toBe(0);
  });
});
