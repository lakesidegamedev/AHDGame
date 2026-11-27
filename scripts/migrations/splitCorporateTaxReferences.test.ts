import { describe, expect, it, vi } from "vitest";
import { createTransactionalMemoryDb } from "../../src/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "../../src/lib/test-utils/faultyDb";
vi.mock("../utils/db", () => ({ connectDb: vi.fn(), closeDb: vi.fn() }));
import { remapReferences, LEGACY_TO_NEW_IDS } from "./splitCorporateTaxDomesticForeign";
describe("canonical corporate tax policy reference migration", () => {
  it("remaps national and regional current law and remains safe after an interrupted prefix", async () => {
    const { db, memory } = createTransactionalMemoryDb();
    memory.seed("statePolicies", [
      {
        _id: "national",
        stateId: "US",
        legislationTypeId: "us_federal_corporate_tax_rate",
        effectiveTurn: 80,
        notes: "preserve",
      },
      {
        _id: "regional",
        stateId: "TX",
        legislationTypeId: "us_state_corporate_tax_rate",
        effectiveTurn: 90,
      },
      { _id: "other", stateId: "ON", legislationTypeId: "unrelated_law", effectiveTurn: 95 },
    ]);
    const fault = withInjectedCrash(memory, {
      collection: "statePolicies",
      op: "updateMany",
      onCall: 1,
      afterWrite: true,
    });
    await expect(remapReferences(fault.db)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    await remapReferences(db);
    const canonical = await db.collection("statePolicies").find({}).toArray();
    expect(canonical.find((r) => String(r._id) === "national")).toMatchObject({
      legislationTypeId: LEGACY_TO_NEW_IDS.us_federal_corporate_tax_rate,
      notes: "preserve",
      effectiveTurn: 80,
    });
    expect(canonical.find((r) => String(r._id) === "regional")).toMatchObject({
      legislationTypeId: LEGACY_TO_NEW_IDS.us_state_corporate_tax_rate,
      effectiveTurn: 90,
    });
    expect(canonical.find((r) => String(r._id) === "other")?.legislationTypeId).toBe(
      "unrelated_law"
    );
    expect((await remapReferences(db)).statePolicies).toBe(0);
    expect(await db.collection("statePolicies").find({}).toArray()).toEqual(canonical);
  });
});
