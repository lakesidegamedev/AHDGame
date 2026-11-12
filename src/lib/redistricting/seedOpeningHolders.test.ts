import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { seatGroupsFor } from "@/lib/constants/historicalSeats";
import { getHouseSeats } from "@/lib/constants/states";
import { seedOpeningHouseHolders } from "./seedOpeningHolders";

function fixture(preset: string) {
  const districts = Object.entries(getHouseSeats(preset)).flatMap(([stateId, count]) =>
    Array.from({ length: count }, (_, n) => ({
      _id: `${stateId}-${n + 1}`,
      stateId,
      index: n + 1,
      netLean: 0,
      holderParty: null as string | null,
      holderNppId: null,
      holderCharacterId: null,
    }))
  );
  const officials = (seatGroupsFor(preset).US ?? [])
    .filter((s) => s.officeType === "house")
    .map((s, i) => ({
      _id: `official-${i}`,
      state: s.state,
      seatsHeld: s.seatsHeld,
      party: s.party,
      isNPP: true,
      nppId: `npp-${i}`,
    }));
  const parties = [
    { _id: "democrat", sequentialId: 1, abbreviation: "DEM", economicPosition: -2 },
    { _id: "republican", sequentialId: 2, abbreviation: "REP", economicPosition: 2 },
  ];
  const bulkWrite = vi.fn().mockResolvedValue({});
  const rows: Record<string, unknown[]> = {
    congressionalDistricts: districts,
    electedOfficials: officials,
    politicalParties: parties,
  };
  const db = {
    collection: (name: string) => ({
      findOne: async () => (name === "gameState" ? { preset } : null),
      find: () => ({ toArray: async () => rows[name] }),
      bulkWrite,
    }),
  } as unknown as Db;
  return { db, districts, officials, bulkWrite };
}

describe("opening House seed preset compatibility", () => {
  it("uses the current world's preset when a targeted caller omits it", async () => {
    const { db } = fixture("2027-default");
    const log = vi.fn();
    expect(await seedOpeningHouseHolders(db, undefined, log)).toBe(435);
    expect(log).not.toHaveBeenCalled();
  });
  it("continues the 2019 opening and logs each incompatible state's reason", async () => {
    const { db, bulkWrite } = fixture("2019-default");
    const log = vi.fn();
    const count = await seedOpeningHouseHolders(db, "2019-default", log);
    expect(log).toHaveBeenCalledTimes(13);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("unmapped in CO"));
    const writes = bulkWrite.mock.calls[0][0] as { updateOne: { filter: { _id: string } } }[];
    const ids = writes.map((w) => w.updateOne.filter._id);
    expect(count).toBe(ids.length);
    expect(ids).toContain("MD-8");
    expect(ids).toContain("WI-8");
    expect(ids).not.toContain("MD-7");
    expect(ids).not.toContain("WI-7");
    expect(ids.some((id) => /^(CA|NY|TX|CO)-/.test(id))).toBe(false);
  });
  it("retains all 435 snapshot-backed 2027 holders", async () => {
    const { db } = fixture("2027-default");
    const log = vi.fn();
    expect(await seedOpeningHouseHolders(db, "2027-default", log)).toBe(435);
    expect(log).not.toHaveBeenCalled();
  });
  it("still rejects a missing delegation on a compatible map before writing", async () => {
    const { db, officials, bulkWrite } = fixture("2019-default");
    officials.splice(
      officials.findIndex((o) => o.state === "AL"),
      1
    );
    await expect(seedOpeningHouseHolders(db, "2019-default", vi.fn())).rejects.toThrow("capacity");
    expect(bulkWrite).not.toHaveBeenCalled();
  });
  it("preserves already occupied states on a targeted reseed", async () => {
    const { db, districts, bulkWrite } = fixture("2027-default");
    districts.find((d) => d.stateId === "CA")!.holderParty = "DEM";
    expect(await seedOpeningHouseHolders(db, "2027-default", vi.fn())).toBe(383);
    expect(JSON.stringify(bulkWrite.mock.calls)).not.toContain('"CA-');
  });
});
