import { beforeEach, describe, expect, it, vi } from "vitest";
import { NationalPartyBillAction } from "./NationalPartyBillAction";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  access: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getAuthUserWithCharacter: mocks.auth }));
vi.mock("@/lib/mongodb", () => ({ getDb: async () => ({}) }));
vi.mock("@/lib/gameState", () => ({ getGameState: async () => ({}) }));
vi.mock("@/lib/countries/runtimeOffices", () => ({
  loadRuntimeCountryOffices: async () => ({
    config: {
      legislature: {
        bicameral: true,
        lowerChamber: { key: "house", seats: 435, elected: true },
        upperChamber: { key: "senate", seats: 100, elected: true },
      },
    },
  }),
}));
vi.mock("@/lib/legislature/chamberOfficeType", () => ({
  getOfficeTypeForChamber: (_country: string, chamber: string) => chamber,
}));
vi.mock("@/lib/legislature/queries/nationalPartyNppAccess", () => ({
  resolveNationalPartyNppAccess: mocks.access,
}));
vi.mock("./NationalPartyBillActionClient", () => ({ NationalPartyBillActionClient: () => null }));

describe("National party proposal server visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ character: { _id: "chair", party: "1", countryId: "US" } });
    mocks.access.mockResolvedValue({ authorized: true, blocked: false, sponsor: {} });
  });

  it("passes an eligible chair's action to the client without requiring a human seat", async () => {
    const action = await NationalPartyBillAction({ countryId: "US" });
    expect(action?.props).toEqual({
      countryId: "US",
      initialChamber: "house",
      blocked: false,
      unavailable: false,
    });
    expect(mocks.access.mock.calls[0][3]).toEqual([
      { chamber: "house", officeType: "house" },
      { chamber: "senate", officeType: "senate" },
    ]);
  });

  it("keeps the action visible but disabled while the party slot is occupied", async () => {
    mocks.access.mockResolvedValue({ authorized: true, blocked: true, sponsor: null });
    expect((await NationalPartyBillAction({ countryId: "US" }))?.props.blocked).toBe(true);
  });

  it("hides the action without chair authority", async () => {
    mocks.access.mockResolvedValue({ authorized: false, blocked: false, sponsor: null });
    expect(await NationalPartyBillAction({ countryId: "US" })).toBeNull();
  });

  it("keeps the action visible with an explanation when the chair has no eligible NPP", async () => {
    mocks.access.mockResolvedValue({ authorized: true, blocked: false, sponsor: null });
    expect((await NationalPartyBillAction({ countryId: "US" }))?.props.unavailable).toBe(true);
  });

  it("hides the action for a signed-out visitor", async () => {
    mocks.auth.mockResolvedValue(null);
    expect(await NationalPartyBillAction({ countryId: "US" })).toBeNull();
    expect(mocks.access).not.toHaveBeenCalled();
  });
});
