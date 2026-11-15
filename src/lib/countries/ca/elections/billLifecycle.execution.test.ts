import { describe, it, expect, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { buildConfiguredCountryBillLifecycle } from "@/lib/turn/billLifecycle/configs/configuredCountry";
import { runBillLifecycle } from "@/lib/turn/billLifecycle/engine";
import { applyEnactedBillEffects } from "@/lib/legislature/commands/applyEnactedBillEffects";
vi.mock("@/lib/legislature/commands/applyEnactedBillEffects", () => ({
  applyEnactedBillEffects: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications", () => ({
  createNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/achievements", () => ({
  awardAchievement: vi.fn(),
  resolveUserIdFromCharacter: vi.fn().mockResolvedValue(null),
}));
describe("Canadian bills against the production lifecycle engine", () => {
  it("freezes pending formation, then enacts and rejects once with Canadian seat weights only", async () => {
    vi.mocked(applyEnactedBillEffects).mockClear();
    const mem = createInMemoryDb(),
      db = mem as unknown as Db;
    const ca = new ObjectId(),
      foreign = new ObjectId(),
      pass = new ObjectId(),
      fail = new ObjectId(),
      usBill = new ObjectId();
    mem.seed("governmentFormations", [{ _id: "CA", status: "pending" }]);
    mem.seed("electedOfficials", [
      {
        _id: new ObjectId(),
        countryId: "CA",
        officeType: "caCommons",
        nppId: ca,
        isNPP: true,
        seatsHeld: 169,
      },
      {
        _id: new ObjectId(),
        countryId: "US",
        officeType: "house",
        nppId: foreign,
        isNPP: true,
        seatsHeld: 435,
      },
    ]);
    const base = {
      countryId: "CA",
      status: "active",
      category: "economic",
      originChamber: "caCommons",
      currentChamber: "caCommons",
      votingEndsOnTurn: 1,
      votesFor: 0,
      votesAgainst: 0,
      votesAbstain: 0,
      coSponsors: [],
    };
    mem.seed("bills", [
      {
        ...base,
        _id: pass,
        title: "Pass",
        votes: { [`npp_${ca}`]: "for", [`npp_${foreign}`]: "against" },
      },
      {
        ...base,
        _id: fail,
        title: "Fail",
        votes: { [`npp_${ca}`]: "against", [`npp_${foreign}`]: "for" },
      },
      { ...base, _id: usBill, countryId: "US", votes: {} },
    ]);
    const config = buildConfiguredCountryBillLifecycle("CA", "2027-default"),
      now = new Date(0);
    expect((await runBillLifecycle(db, config, now, 2, "2027-default")).billsProcessed).toBe(0);
    await mem
      .collection("governmentFormations")
      .updateOne({ _id: "CA" }, { $set: { status: "formed" } });
    const result = await runBillLifecycle(db, config, now, 2, "2027-default");
    expect(result.billsPassed).toBe(1);
    expect(result.billsFailed).toBe(1);
    expect(await mem.collection("bills").findOne({ _id: pass })).toMatchObject({
      status: "signed",
      votesFor: 169,
      votesAgainst: 0,
    });
    expect(await mem.collection("bills").findOne({ _id: fail })).toMatchObject({
      status: "failed",
      votesAgainst: 169,
      votesFor: 0,
    });
    expect(await mem.collection("bills").findOne({ _id: usBill })).toMatchObject({
      status: "active",
    });
    await runBillLifecycle(db, config, now, 2, "2027-default");
    expect(applyEnactedBillEffects).toHaveBeenCalledTimes(1);
    expect(vi.mocked(applyEnactedBillEffects).mock.calls[0][1]).toMatchObject({ countryId: "CA" });
  });
});
