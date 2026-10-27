import { beforeEach, describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { resolveNationalPartyNppAccess } from "./nationalPartyNppAccess";
import { NATIONAL_NPP_IN_FLIGHT } from "../rules/nationalPartyNpp";
describe("National chair sponsorship access", () => {
  let memory: ReturnType<typeof createInMemoryDb>;
  const chair = new ObjectId(),
    house = new ObjectId(),
    senate = new ObjectId();
  const actor = { _id: chair, countryId: "US" as const, party: "1" };
  const chambers = [
    { officeType: "house", chamber: "house" },
    { officeType: "senate", chamber: "senate" },
  ];
  const access = (rng = () => 0) =>
    resolveNationalPartyNppAccess(memory as unknown as Db, "US", actor, chambers, rng);
  beforeEach(async () => {
    memory = createInMemoryDb();
    await memory
      .collection("politicalParties")
      .insertOne({ _id: new ObjectId(), countryId: "US", sequentialId: 1, chairId: chair });
    for (const [id, officeType] of [
      [house, "house"],
      [senate, "senate"],
    ] as const) {
      await memory
        .collection("npps")
        .insertOne({ _id: id, countryId: "US", name: officeType, party: "1", retiredAt: null });
      await memory.collection("electedOfficials").insertOne({
        _id: new ObjectId(),
        countryId: "US",
        officeType,
        nppId: id,
        isNPP: true,
        seatsHeld: 1,
      });
    }
  });
  it("randomly selects either chamber's seated NPP", async () => {
    expect((await access()).sponsor?.chamber).toBe("house");
    expect((await access(() => 0.999)).sponsor?.chamber).toBe("senate");
  });
  it.each(NATIONAL_NPP_IN_FLIGHT)(
    "blocks another NPP bill across chambers while a bill is %s",
    async (status) => {
      await memory.collection("bills").insertOne({
        _id: new ObjectId(),
        countryId: "US",
        sponsorParty: "1",
        nppSponsored: true,
        status,
        currentChamber: "senate",
        category: "foreign policy",
      });
      expect((await access()).blocked).toBe(true);
    }
  );
  it("does not grant state chairs or ordinary members national authority", async () => {
    await memory
      .collection("politicalParties")
      .updateOne({ sequentialId: 1 }, { $set: { chairId: new ObjectId(), viceChairId: chair } });
    expect((await access()).authorized).toBe(false);
  });
  it("ignores human bills, other parties, other countries, and terminal bills", async () => {
    await memory.collection("bills").insertMany([
      { countryId: "US", sponsorParty: "1", status: "active" },
      { countryId: "US", sponsorParty: "2", nppSponsored: true, status: "active" },
      { countryId: "UK", sponsorParty: "1", nppSponsored: true, status: "active" },
      { countryId: "US", sponsorParty: "1", nppSponsored: true, status: "signed" },
    ]);
    expect((await access()).sponsor).toBeTruthy();
  });
  it("excludes retired and zero-seat NPPs", async () => {
    await memory.collection("npps").updateOne({ _id: house }, { $set: { retiredAt: new Date() } });
    await memory
      .collection("electedOfficials")
      .updateOne({ nppId: senate }, { $set: { seatsHeld: 0 } });
    expect((await access()).sponsor).toBeNull();
  });
});
