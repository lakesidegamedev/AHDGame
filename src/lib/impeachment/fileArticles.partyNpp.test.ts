import { describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { fileArticlesOfImpeachment } from "./fileArticles";

const PLAYER = new ObjectId("6ac3d448c6e9f850d9777705");
const NPP = new ObjectId("6acf8c775cd5e4d9da388022");
const GOVERNOR = new ObjectId("6ac000000000000000000001");
const OTHER_CHAIR = new ObjectId("6ac000000000000000000002");

function seed(opts: { filerSeat: boolean; chairId: ObjectId; partySeat: boolean }) {
  const db = createInMemoryDb();
  db.seed("gameState", [{ currentTurn: 100 }]);
  db.seed("characters", [{ _id: GOVERNOR, name: "Governor Test" }]);
  db.collection("electedOfficials").docs.push({
    _id: new ObjectId(),
    countryId: "US",
    state: "NY",
    officeType: "governor",
    isNPP: false,
    characterId: GOVERNOR,
    seatsHeld: 1,
  });
  if (opts.filerSeat) {
    db.collection("electedOfficials").docs.push({
      _id: new ObjectId(),
      countryId: "US",
      state: "NY",
      officeType: "stateSenate",
      isNPP: false,
      characterId: PLAYER,
      seatsHeld: 1,
    });
  }
  if (opts.partySeat) {
    db.collection("electedOfficials").docs.push({
      _id: new ObjectId(),
      countryId: "US",
      state: "NY",
      officeType: "stateSenate",
      isNPP: true,
      characterId: null,
      nppId: NPP,
      seatsHeld: 51,
    });
    db.seed("npps", [
      { _id: NPP, name: "Jason Campbell", party: "8", countryId: "US", retiredAt: null },
    ]);
  }
  db.seed("politicalParties", [
    { _id: new ObjectId(), countryId: "US", sequentialId: 8, chairId: opts.chairId },
  ]);
  db.seed("statePartyOrg", [
    { _id: new ObjectId(), countryId: "US", stateId: "NY", partyId: "8", chairId: opts.chairId },
  ]);
  return db as unknown as Db;
}

const filer = { _id: PLAYER, name: "Bill Clinton", party: "8", countryId: "US" as const };
const file = (db: Db) =>
  fileArticlesOfImpeachment(db, "US", filer, false, { office: "governor", state: "NY" });

describe("fileArticlesOfImpeachment party NPP route", () => {
  it("keeps the seated filer as the filer", async () => {
    const db = seed({ filerSeat: true, chairId: PLAYER, partySeat: true });
    await file(db);
    const doc = db.collection("impeachments").docs.at(-1)!;
    expect(doc.filedByName).toBe("Bill Clinton");
    expect(doc.filedByNppId).toBeUndefined();
    expect(doc.filedByCharacterId.toString()).toBe(PLAYER.toString());
  });

  it("lets a party chair with no seat file through a seated party NPP", async () => {
    const db = seed({ filerSeat: false, chairId: PLAYER, partySeat: true });
    await file(db);
    const doc = db.collection("impeachments").docs.at(-1)!;
    expect(doc.filedByName).toBe("Jason Campbell");
    expect(doc.filedByNppId.toString()).toBe(NPP.toString());
    expect(doc.filedByCharacterId.toString()).toBe(PLAYER.toString());
  });

  it("rejects a character who is not the party chair", async () => {
    const db = seed({ filerSeat: false, chairId: OTHER_CHAIR, partySeat: true });
    await expect(file(db)).rejects.toThrow(/sitting member/);
  });

  it("rejects a chair when the party has no seated legislator", async () => {
    const db = seed({ filerSeat: false, chairId: PLAYER, partySeat: false });
    await expect(file(db)).rejects.toThrow(/No seated NY legislator/);
  });
});
