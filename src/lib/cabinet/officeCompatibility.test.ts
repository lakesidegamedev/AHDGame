import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { getIncompatibleOfficeHolders } from "./officeCompatibility";
import { requiresCabinetIndependence, incompatibleBankHolders } from "./rules/officeCompatibility";

describe("cabinet and bank office compatibility", () => {
  it("excludes chairs across countries and every US player board seat", () => {
    expect([
      ...incompatibleBankHolders([
        {
          countryId: "UK",
          chairCharacterId: "uk",
          fomcBoard: [{ occupantType: "player", characterId: "uk-member" }],
        },
        { countryId: "JP", chairCharacterId: "jp" },
        {
          countryId: "US",
          chairCharacterId: "us",
          fomcBoard: [
            { occupantType: "player", characterId: "governor" },
            { occupantType: "vacant", characterId: "departed" },
            { occupantType: "npp", characterId: "npp" },
          ],
        },
      ]),
    ]).toEqual(["uk", "jp", "us", "governor"]);
  });
  it("restores eligibility once the active bank role is vacated", () => {
    expect(
      incompatibleBankHolders([
        {
          countryId: "US",
          chairCharacterId: null,
          fomcBoard: [{ occupantType: "vacant", characterId: null }],
        },
      ]).size
    ).toBe(0);
  });
  it("batches current cabinet membership and stops excluding a departed minister", async () => {
    const id = new ObjectId();
    const toArray = vi
      .fn()
      .mockResolvedValueOnce([{ characterId: id }])
      .mockResolvedValueOnce([]);
    const find = vi.fn(() => ({ toArray }));
    const db = { collection: vi.fn(() => ({ find })) } as unknown as Db;
    expect((await getIncompatibleOfficeHolders(db, "bank", [id])).has(id.toString())).toBe(true);
    expect((await getIncompatibleOfficeHolders(db, "bank", [id])).has(id.toString())).toBe(false);
    expect(find).toHaveBeenCalledWith(
      { characterId: { $in: [id] } },
      { projection: { characterId: 1 } }
    );
  });
  it("reads the bank roles rather than the character primary office", async () => {
    const id = new ObjectId();
    const find = vi.fn(() => ({
      toArray: async () => [
        {
          countryId: "US",
          chairCharacterId: null,
          fomcBoard: [{ occupantType: "player", characterId: id }],
        },
      ],
    }));
    const db = { collection: vi.fn(() => ({ find })) } as unknown as Db;
    expect((await getIncompatibleOfficeHolders(db, "cabinet", [id])).has(id.toString())).toBe(true);
    expect(db.collection).toHaveBeenCalledWith("centralBanks");
    expect(find).toHaveBeenCalledTimes(1);
  });
  it("does not query for an empty nomination batch", async () => {
    const db = { collection: vi.fn() } as unknown as Db;
    expect((await getIncompatibleOfficeHolders(db, "cabinet", [])).size).toBe(0);
    expect(db.collection).not.toHaveBeenCalled();
  });
});

describe("cabinet independence by bank seat", () => {
  it.each([
    ["US", false, true],
    ["US", true, true],
    ["UK", false, false],
    ["UK", true, true],
    ["JP", false, false],
    ["JP", true, true],
  ] as const)("%s chair=%s requires independence=%s", (countryId, isChair, expected) => {
    expect(requiresCabinetIndependence(countryId, isChair)).toBe(expected);
  });
});
