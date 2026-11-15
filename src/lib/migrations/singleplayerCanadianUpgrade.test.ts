import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { caRegions2027 } from "@/lib/countries/ca/data/caRegions2027";
import { migration } from "./entries/2026-11-14-canadian-census-divisions";
import {
  SINGLEPLAYER_BASELINE_MARKER,
  SINGLEPLAYER_MIGRATIONS,
  migrateSingleplayerWorld,
} from "./singleplayerMigrations";

const mocks = vi.hoisted(() => ({ isSingleplayer: vi.fn(() => true) }));
vi.mock("@/lib/singleplayer", () => ({ isSingleplayer: mocks.isSingleplayer }));
vi.mock("./startupMigrations", () => ({
  runRequiredStartupMigrations: vi.fn(async () => ({
    ranIds: [],
    skippedIds: [],
    results: {},
    dryRun: false,
  })),
}));

function fixture() {
  const memory = createInMemoryDb();
  memory.seed("gameState", [
    {
      _id: "current",
      preset: "2027-default",
      worldEpochId: "existing-save",
      currentTurn: 12,
      isActive: true,
      isProcessing: false,
    },
  ]);
  memory.seed(
    "states",
    caRegions2027.map((region) => ({ ...structuredClone(region) }))
  );
  memory.seed("counties", [{ _id: "06001", countryId: "US", stateId: "CA", population: 123 }]);
  memory.seed(
    "migrationsRun",
    [
      ...SINGLEPLAYER_MIGRATIONS.filter((item) => item.id !== migration.id).map((item) => item.id),
      SINGLEPLAYER_BASELINE_MARKER,
    ].map((id) => ({ _id: id }))
  );
  return { memory, db: memory as unknown as Db };
}

describe("Canadian subdivisions in existing singleplayer saves", () => {
  beforeEach(() => mocks.isSingleplayer.mockReturnValue(true));

  it("upgrades an active idle save through the migration runner and replays without changing stocks", async () => {
    const { memory, db } = fixture();
    const openingState = structuredClone(memory.collection("gameState").docs[0]);
    const summary = await migrateSingleplayerWorld(db);
    expect(summary?.ranIds).toEqual([migration.id]);
    expect(memory.collection("gameState").docs[0]).toEqual(openingState);
    const counties = memory.collection("counties").docs;
    expect(counties.filter((row) => row.countryId === "CA")).toHaveLength(293);
    for (const region of caRegions2027)
      expect(
        counties
          .filter((row) => row.countryId === "CA" && row.stateId === region._id)
          .reduce((sum, row) => sum + Number(row.population), 0)
      ).toBe(region.population);
    expect(counties.find((row) => row._id === "06001")?.population).toBe(123);
    expect(
      memory.collection("migrationsRun").docs.find((row) => row._id === migration.id)
    ).toMatchObject({ markerVersion: 1, completedAt: expect.any(Date) });
    const upgraded = structuredClone(counties);
    expect((await migrateSingleplayerWorld(db))?.ranIds).toEqual([]);
    expect(memory.collection("counties").docs).toEqual(upgraded);
  });

  it("still requires a paused hosted world", async () => {
    mocks.isSingleplayer.mockReturnValue(false);
    const { memory, db } = fixture();
    await expect(migrateSingleplayerWorld(db)).rejects.toThrow("Pause turns");
    expect(memory.collection("counties").docs).toHaveLength(1);
    expect(memory.collection("migrationsRun").docs.some((row) => row._id === migration.id)).toBe(
      false
    );
  });

  it("still refuses a singleplayer save with a processing turn", async () => {
    const { memory, db } = fixture();
    memory.collection("gameState").docs[0].isProcessing = true;
    await expect(migrateSingleplayerWorld(db)).rejects.toThrow("Pause turns");
    expect(memory.collection("counties").docs).toHaveLength(1);
    expect(memory.collection("migrationsRun").docs.some((row) => row._id === migration.id)).toBe(
      false
    );
  });
});
