import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/constants/countries", () => ({
  getCountryConfig: vi.fn(),
}));

let db: MockDb;

beforeEach(() => {
  vi.clearAllMocks();
  db = createMockDb();
  db.collection("cabinetMembers");
});

describe("assertTreasuryAuthority", () => {
  it("authorizes the seated finance minister", async () => {
    const actor = new ObjectId();
    const { getCountryConfig } = await import("@/lib/constants/countries");
    vi.mocked(getCountryConfig).mockReturnValue({
      financeMinisterCabinetId: "secretary_of_treasury",
    } as never);
    db.collectionMocks.cabinetMembers.findOne.mockResolvedValue({
      countryId: "US",
      positionId: "secretary_of_treasury",
      characterId: actor,
    });

    const { assertTreasuryAuthority } = await import("./authority");
    expect(await assertTreasuryAuthority(db as unknown as Db, "US", actor)).toBe(true);
  });

  it("rejects a non-finance-minister when the seat is filled by someone else", async () => {
    const actor = new ObjectId();
    const seatedOther = new ObjectId();
    const { getCountryConfig } = await import("@/lib/constants/countries");
    vi.mocked(getCountryConfig).mockReturnValue({
      financeMinisterCabinetId: "secretary_of_treasury",
    } as never);
    db.collectionMocks.cabinetMembers.findOne.mockResolvedValue({
      countryId: "US",
      positionId: "secretary_of_treasury",
      characterId: seatedOther,
    });

    const { assertTreasuryAuthority } = await import("./authority");
    expect(await assertTreasuryAuthority(db as unknown as Db, "US", actor)).toBe(false);
  });

  it("denies the head of government when the seat is vacant", async () => {
    const actor = new ObjectId();
    const { getCountryConfig } = await import("@/lib/constants/countries");
    vi.mocked(getCountryConfig).mockReturnValue({
      financeMinisterCabinetId: "secretary_of_treasury",
    } as never);
    db.collectionMocks.cabinetMembers.findOne.mockResolvedValue({
      countryId: "US",
      positionId: "secretary_of_treasury",
      characterId: null, // vacant
    });

    const { assertTreasuryAuthority } = await import("./authority");
    expect(await assertTreasuryAuthority(db as unknown as Db, "US", actor)).toBe(false);
  });

  it("denies action when the country has no finance portfolio", async () => {
    const actor = new ObjectId();
    const { getCountryConfig } = await import("@/lib/constants/countries");
    vi.mocked(getCountryConfig).mockReturnValue({ financeMinisterCabinetId: undefined } as never);

    const { assertTreasuryAuthority } = await import("./authority");
    expect(await assertTreasuryAuthority(db as unknown as Db, "US", actor)).toBe(false);
    expect(db.collectionMocks.cabinetMembers.findOne).not.toHaveBeenCalled();
  });
});
