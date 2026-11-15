import { expect, it } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { ensureUSMinorPartyOrgs } from "./seedMinorPartyOrgs";

it("creates empty chapters with live US party IDs and preserves developed chapters on replay", async () => {
  const memory = createInMemoryDb();
  memory.seed("states", [
    { _id: "PA", countryId: "US" },
    { _id: "DC", countryId: "US" },
    { _id: "CA_ON", countryId: "CA" },
  ]);
  memory.seed("politicalParties", [
    { _id: "green", countryId: "US", name: "Green Party", sequentialId: 9, isDefault: true },
    { _id: "lib", countryId: "US", name: "Libertarian Party", sequentialId: 7, isDefault: true },
    {
      _id: "foreign-green",
      countryId: "UK",
      name: "Green Party",
      sequentialId: 6,
      isDefault: true,
    },
  ]);
  const db = memory as unknown as Db;
  await ensureUSMinorPartyOrgs(db, "2027-default");
  const rows = await memory.collection("statePartyOrg").find({}).toArray();
  expect(rows.map((r) => r._id).sort()).toEqual(["DC_7", "DC_9", "PA_7", "PA_9"]);
  expect(
    rows.every(
      (r) => r.countryId === "US" && r.organization === 0 && r.registration === 0 && !r.hasPresence
    )
  ).toBe(true);
  await memory.collection("statePartyOrg").updateOne(
    { _id: "PA_9" },
    {
      $set: {
        organization: 12,
        registration: 3,
        treasury: 1200,
        chairId: "elected-chair",
        hasPresence: true,
      },
    }
  );
  const played = await memory.collection("statePartyOrg").findOne({ _id: "PA_9" });
  await ensureUSMinorPartyOrgs(db, "2027-default");
  expect(await memory.collection("statePartyOrg").findOne({ _id: "PA_9" })).toEqual(played);
  expect(await memory.collection("statePartyOrg").countDocuments()).toBe(4);
  await memory
    .collection("statePartyOrg")
    .updateOne(
      { _id: "PA_9" },
      { $set: { organizationUnits: 88, lastOrganizationBuildTurn: 300 } }
    );
  await ensureUSMinorPartyOrgs(db, "2027-default", true);
  expect(await memory.collection("statePartyOrg").findOne({ _id: "PA_9" })).toMatchObject({
    organization: 0,
    registration: 0,
    treasury: 0,
    chairId: null,
    hasPresence: false,
  });
  expect(await memory.collection("statePartyOrg").findOne({ _id: "PA_9" })).not.toHaveProperty(
    "organizationUnits"
  );
  expect(await memory.collection("statePartyOrg").countDocuments()).toBe(4);
});

it("does not create parties' chapters before their founding presets", async () => {
  const memory = createInMemoryDb();
  memory.seed("states", [{ _id: "PA", countryId: "US" }]);
  memory.seed("politicalParties", [
    { _id: "green", countryId: "US", name: "Green Party", sequentialId: 3, isDefault: true },
    { _id: "lib", countryId: "US", name: "Libertarian Party", sequentialId: 4, isDefault: true },
  ]);
  await ensureUSMinorPartyOrgs(memory as unknown as Db, "1953-default");
  expect(await memory.collection("statePartyOrg").countDocuments()).toBe(0);
  await ensureUSMinorPartyOrgs(memory as unknown as Db, "1991-default");
  expect((await memory.collection("statePartyOrg").find({}).toArray()).map((r) => r._id)).toEqual([
    "PA_4",
  ]);
});
