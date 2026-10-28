import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { NationalPartyBillAction } from "./NationalPartyBillAction";

const mocks = vi.hoisted(() => ({ db: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthUserWithCharacter: mocks.auth }));
vi.mock("@/lib/mongodb", () => ({ getDb: mocks.db }));
vi.mock("@/lib/gameState", () => ({ getGameState: async () => ({ preset: "1997-default" }) }));
vi.mock("@/lib/countries/runtimeOffices", async () => {
  const { getCountryConfig } = await import("@/lib/constants/countries");
  return { loadRuntimeCountryOffices: async () => ({ config: getCountryConfig("US") }) };
});
vi.mock("./NationalPartyBillActionClient", () => ({ NationalPartyBillActionClient: () => null }));

describe("US Congress chair action with real sponsor lookup", () => {
  let db: ReturnType<typeof createInMemoryDb>;
  const chair = new ObjectId();
  const npp = new ObjectId();

  beforeEach(async () => {
    db = createInMemoryDb();
    mocks.db.mockResolvedValue(db);
    mocks.auth.mockResolvedValue({ character: { _id: chair, countryId: "US", party: "1" } });
    await db.collection("politicalParties").insertOne({
      _id: new ObjectId(),
      countryId: "US",
      sequentialId: 1,
      chairId: chair,
    });
    await db.collection("npps").insertOne({
      _id: npp,
      countryId: "US",
      party: "1",
      name: "Party legislator",
      retiredAt: null,
    });
  });

  it.each(["house", "senate"])(
    "enables the chair action for an untagged legacy %s seat",
    async (officeType) => {
      await db.collection("electedOfficials").insertOne({
        _id: new ObjectId(),
        officeType,
        nppId: npp,
        isNPP: true,
        seatsHeld: 1,
      });
      const action = await NationalPartyBillAction({ countryId: "US" });
      expect(action?.props).toMatchObject({ countryId: "US", blocked: false, unavailable: false });
    }
  );

  it("does not enable the US chair action using a foreign seat", async () => {
    await db.collection("electedOfficials").insertOne({
      _id: new ObjectId(),
      countryId: "BR",
      officeType: "house",
      nppId: npp,
      isNPP: true,
    });
    expect((await NationalPartyBillAction({ countryId: "US" }))?.props.unavailable).toBe(true);
  });
});
