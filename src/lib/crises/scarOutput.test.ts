import { describe, expect, it } from "vitest";
import { loadScarOutputEntries } from "./scarOutput";

const db = (scars: unknown[]) =>
  ({
    collection: () => ({ find: () => ({ toArray: async () => [{ v2: { scars } }] }) }),
  }) as never;

const base = { ruleId: "r", magnitude: 0.1, createdTurn: 10, recoveryTurns: 20 };

describe("loadScarOutputEntries", () => {
  it("turns output scars into standing cuts that shrink as they heal", async () => {
    const scars = [{ ...base, kind: "regionalOutput", targetId: "US" }];
    const stateIdsByCountry = new Map([["US", ["TX", "OH"]]]);
    const early = await loadScarOutputEntries(db(scars), 10, stateIdsByCountry);
    expect(early.get("TX")?.[0]).toMatchObject({ value: -10, persistent: true, sectorType: null });
    expect(early.has("OH")).toBe(true);
    const later = await loadScarOutputEntries(db(scars), 20, stateIdsByCountry);
    expect(later.get("TX")?.[0].value).toBeCloseTo(-5);
    expect((await loadScarOutputEntries(db(scars), 30, stateIdsByCountry)).size).toBe(0);
  });

  it("limits a capacity scar to its sector and ignores scars written elsewhere", async () => {
    const scars = [
      { ...base, kind: "plantCapacity", targetId: "TX", sectorType: "energy" },
      { ...base, kind: "creditStanding", targetId: "TX" },
    ];
    const map = await loadScarOutputEntries(db(scars), 10, new Map());
    expect(map.get("TX")).toHaveLength(1);
    expect(map.get("TX")?.[0].sectorType).toBe("energy");
  });
});
