import { expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { caParties } from "./data/caParties";
import { CA_LEGACY_PARTY_NAMES } from "./data/caLegacyPartyNames";
import { reconcileCaDefaultPartyIdentities } from "./reconcileDefaultPartyIdentities";

function fixture() {
  const memory = createInMemoryDb();
  const rows = caParties.map((seed, i) => ({
    _id: new ObjectId(),
    countryId: "CA",
    sequentialId: i + 8,
    isDefault: true,
    name: CA_LEGACY_PARTY_NAMES[seed.name]!,
    abbreviation: "OLD",
    treasury: 987654,
    memberCount: 12,
    color: "#123456",
    economicPosition: 2,
    chairId: new ObjectId(),
    committeeIds: [new ObjectId()],
  }));
  const foreign = { ...rows[0]!, _id: new ObjectId(), countryId: "US" };
  memory.seed("politicalParties", [...rows, foreign]);
  memory.seed("statePartyOrg", [{ _id: "CA_ON_8", countryId: "CA", partyId: "8", treasury: 300 }]);
  memory.seed("electedOfficials", [
    { _id: new ObjectId(), countryId: "CA", party: "8", officeType: "caCommons" },
  ]);
  return { memory, db: memory as unknown as Db, rows, foreign };
}

it("corrects every default identity while preserving IDs, played state and country-scoped references", async () => {
  const { memory, db, rows, foreign } = fixture();
  const orgs = await memory.collection("statePartyOrg").find({}).toArray();
  const officials = await memory.collection("electedOfficials").find({}).toArray();
  expect(await reconcileCaDefaultPartyIdentities(db, "2027-default")).toBe(5);
  const parties = await memory.collection("politicalParties").find({ countryId: "CA" }).toArray();
  expect(parties).toHaveLength(5);
  for (const [i, row] of rows.entries()) {
    const updated = parties.find((p) => String(p._id) === String(row._id))!;
    const {
      name: _name,
      abbreviation: _abbreviation,
      updatedAt: _updatedAt,
      ...preserved
    } = updated;
    const { name: _oldName, abbreviation: _oldAbbreviation, ...original } = row;
    expect(preserved).toEqual(original);
    expect(updated).toMatchObject({
      name: caParties[i]!.name,
      abbreviation: caParties[i]!.abbreviation,
    });
  }
  expect(await memory.collection("politicalParties").findOne({ _id: foreign._id })).toEqual(
    foreign
  );
  expect(await memory.collection("statePartyOrg").find({}).toArray()).toEqual(orgs);
  expect(await memory.collection("electedOfficials").find({}).toArray()).toEqual(officials);
  expect(await reconcileCaDefaultPartyIdentities(db, "2027-default")).toBe(0);
  expect(await memory.collection("politicalParties").find({ countryId: "CA" }).toArray()).toEqual(
    parties
  );
});

it.each([true, false])(
  "rejects a canonical-name collision before any write (default=%s)",
  async (isDefault) => {
    const { memory, db, rows } = fixture();
    await memory
      .collection("politicalParties")
      .insertOne({ _id: new ObjectId(), countryId: "CA", name: caParties[1]!.name, isDefault });
    const write = vi.spyOn(memory.collection("politicalParties"), "bulkWrite");
    await expect(reconcileCaDefaultPartyIdentities(db, "2027-default")).rejects.toThrow(
      /Conflicting|already held/
    );
    expect(write).not.toHaveBeenCalled();
    expect(await memory.collection("politicalParties").findOne({ _id: rows[0]!._id })).toEqual(
      rows[0]
    );
  }
);

it("leaves historical presets and non-default parties untouched", async () => {
  const { memory, db, rows } = fixture();
  expect(await reconcileCaDefaultPartyIdentities(db, "1991-default")).toBe(0);
  await memory
    .collection("politicalParties")
    .updateMany({ countryId: "CA" }, { $set: { isDefault: false } });
  expect(await reconcileCaDefaultPartyIdentities(db, "2027-default")).toBe(0);
  expect(await memory.collection("politicalParties").findOne({ _id: rows[0]!._id })).toMatchObject({
    name: rows[0]!.name,
    isDefault: false,
  });
});

it("removes legacy Bloc chapter restrictions while preserving organization and registration", async () => {
  const { memory, db, rows } = fixture();
  memory.seed("statePartyOrg", [
    {
      _id: "CA_AB_11",
      countryId: "CA",
      partyId: String(rows[3]!.sequentialId),
      stateId: "CA_AB",
      hasPresence: false,
      organization: 5,
      registration: 0,
      treasury: 1200,
    },
  ]);
  await reconcileCaDefaultPartyIdentities(db, "2027-default");
  expect(await memory.collection("statePartyOrg").findOne({ _id: "CA_AB_11" })).toMatchObject({
    countryId: "CA",
    hasPresence: true,
    organization: 5,
    registration: 0,
    treasury: 1200,
  });
  expect(await reconcileCaDefaultPartyIdentities(db, "2027-default")).toBe(0);
});

it("protects a custom canonical name even without a surviving legacy default", async () => {
  const { memory, db } = fixture();
  await memory.collection("politicalParties").deleteMany({ countryId: "CA" });
  const custom = {
    _id: new ObjectId(),
    countryId: "CA",
    name: caParties[0]!.name,
    isDefault: false,
    treasury: 42,
  };
  await memory.collection("politicalParties").insertOne(custom);
  await expect(reconcileCaDefaultPartyIdentities(db, "2027-default")).rejects.toThrow(
    "already held"
  );
  expect(await memory.collection("politicalParties").findOne({ _id: custom._id })).toEqual(custom);
});
