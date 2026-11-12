import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { createSpawnDirector } from "./spawnDirector";
import { SPAWN_BUDGET } from "./v2/spawnBudget";

function dbWith(active: unknown[]) {
  const db = createMockDb();
  db.collection("crises").find.mockReturnValue({ toArray: async () => active });
  db.collection("livingConflicts").find.mockReturnValue({ toArray: async () => [] });
  return db as unknown as Db;
}

const national = (key: string, countryId: string) => ({
  key: `${key}:${countryId}`,
  definitionId: `legacy:${key}`,
  scope: "national" as const,
  countryIds: [countryId],
  priority: 10,
});

describe("spawn director", () => {
  it("lets a country carry two national crises and refuses the third", async () => {
    const director = await createSpawnDirector(dbWith([]), 100, new Set(["US"]));
    expect(director.allow(national("recession", "US"))).toBe(true);
    expect(director.allow(national("trade_war", "US"))).toBe(true);
    expect(director.allow(national("energy_crisis", "US"))).toBe(false);
    expect(director.allow(national("energy_crisis", "UK"))).toBe(true);
  });

  it("counts crises already live, legacy documents included", async () => {
    const live = [
      { scope: "country", countryIds: ["US"], startTurn: 90, templateKey: "recession" },
      { scope: "country", countryIds: ["US"], startTurn: 95, templateKey: "trade_war" },
    ];
    const director = await createSpawnDirector(dbWith(live), 100, new Set(["US"]));
    expect(director.allow(national("energy_crisis", "US"))).toBe(false);
  });

  it("prices a regional disaster below a national crisis", async () => {
    const live = [
      { scope: "country", countryIds: ["US"], startTurn: 90, templateKey: "recession" },
    ];
    const director = await createSpawnDirector(dbWith(live), 100, new Set(["US"]));
    const disaster = (key: string) => ({
      key,
      definitionId: `legacy:${key}`,
      scope: "state" as const,
      countryIds: ["US"],
      priority: 5,
    });
    expect(director.allow(disaster("flood:A"))).toBe(true);
    expect(director.allow(disaster("hurricane:B"))).toBe(true);
  });

  it("ignores opportunities and campaign response windows", async () => {
    const live = [
      { scope: "country", countryIds: ["US"], startTurn: 90, opportunity: true },
      { scope: "country", countryIds: ["US"], startTurn: 90, livingConflictEventId: "x:1" },
      { scope: "country", countryIds: ["US"], startTurn: 90, templateKey: "recession" },
    ];
    const director = await createSpawnDirector(dbWith(live), 100, new Set(["US"]));
    expect(director.allow(national("trade_war", "US"))).toBe(true);
  });

  it("stops after the per-turn opening cap", async () => {
    const director = await createSpawnDirector(dbWith([]), 100, new Set());
    let approved = 0;
    for (let i = 0; i < 10; i++) {
      if (director.allow(national("recession", `C${i}`))) approved += 1;
    }
    expect(approved).toBe(SPAWN_BUDGET.maxOpensPerTurn);
  });

  it("spaces global shocks", async () => {
    const live = [{ scope: "global", countryIds: [], startTurn: 90, templateKey: "pandemic" }];
    const director = await createSpawnDirector(dbWith(live), 100, new Set());
    const global = {
      key: "oil",
      definitionId: "legacy:oil_shock",
      scope: "global" as const,
      countryIds: [],
      priority: 1,
    };
    expect(director.allow(global)).toBe(false);
  });
});
