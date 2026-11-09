import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import {
  fullSimulationCountries,
  PREFLIGHT_PRESET,
  residueScanContractProblems,
  runPreflight2027,
  SEAT_FIELD_REQUIREMENTS,
} from "./preflight2027";
import { REMOVED_ALWAYS_ON_FLAGS } from "./rules/preflight2027";

async function seedWorld(db: Db, countries: string[]) {
  await db.collection("gameState").insertOne({
    _id: "current",
    ...Object.fromEntries(REMOVED_ALWAYS_ON_FLAGS.map((f) => [f, true])),
    nppAutonomyLevel: "v6",
  } as never);
  for (const countryId of countries) {
    await db.collection("states").insertOne({
      _id: `${countryId}-1`,
      countryId,
      gdp: 5,
      population: 50,
      houseDistricts: 3,
      stateSenateSeats: 4,
    } as never);
  }
}

describe("2027 preflight shell", () => {
  it("covers the owner's tiers: US plus UK, DE, JP, CN", () => {
    expect(new Set(fullSimulationCountries(PREFLIGHT_PRESET))).toEqual(
      new Set(["US", "UK", "DE", "JP", "CN"])
    );
    expect(
      SEAT_FIELD_REQUIREMENTS.some((r) => r.countryId === "DE" && r.level === "positive")
    ).toBe(true);
  });

  it("keeps the residue scan contract self-consistent", () => {
    expect(residueScanContractProblems()).toEqual([]);
  });

  it("passes a populated world and reports only seed or residue gaps if any", async () => {
    const db = createInMemoryDb();
    await seedWorld(db as unknown as Db, fullSimulationCountries(PREFLIGHT_PRESET));
    const report = await runPreflight2027(db as unknown as Db, { mode: "fresh" });
    expect(report.findings).toEqual([]);
  });

  it("fails on a damaged world and writes nothing", async () => {
    const db = createInMemoryDb();
    const all = fullSimulationCountries(PREFLIGHT_PRESET);
    await seedWorld(db as unknown as Db, all);
    await db
      .collection("states")
      .updateOne({ _id: "DE-1" } as never, { $set: { stateSenateSeats: 0 } });
    await db.collection("states").updateOne({ _id: "JP-1" } as never, { $set: { gdp: 0 } });
    await db.collection("npps").insertOne({ _id: "n1", archetypeApprovals: { "a:b": 1 } } as never);
    await db
      .collection("federalBudget")
      .insertOne({ _id: "US", countryId: "US", priceIndex: 1.1 } as never);
    const before = JSON.stringify(await db.collection("states").find({}).toArray());
    const report = await runPreflight2027(db as unknown as Db, { mode: "fresh" });
    const checks = report.findings.filter((f) => f.severity === "fail").map((f) => f.check);
    expect(checks).toEqual(
      expect.arrayContaining([
        "state-gdp-population",
        "chamber-seat-fields",
        "legacy-fields",
        "price-index",
      ])
    );
    expect(JSON.stringify(await db.collection("states").find({}).toArray())).toBe(before);
  });
});
