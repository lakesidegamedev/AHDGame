import { beforeAll, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { CA_GEOGRAPHY_REGIONS } from "../rules/localGeography";
import {
  ensureCAElections,
  ensureCAProvincialElections,
  ensureCAPremierElections,
} from "./perpetual";

vi.mock("@/lib/mongodb", async () => {
  const fixture = await import("@/lib/test-utils/__fixtures__/bootstrapProbe");
  return {
    getDb: vi.fn(async () => fixture.currentProbeDb()),
    getMongoClient: vi.fn(async () => ({ db: () => ({ command: async () => ({}) }) })),
  };
});

let db: Db;
beforeAll(async () => {
  const { probeBootstrap } = await import("@/lib/test-utils/__fixtures__/bootstrapProbe");
  ({ db } = await probeBootstrap("2027-default"));
}, 600_000);

it("opens all Canadian families during actual bootstrap before any gameplay turn", async () => {
  const state = await db.collection("gameState").findOne({ _id: "current" } as never);
  expect(state?.currentTurn).toBe(1);
  const races = await db.collection("elections").find({ countryId: "CA" }).toArray();
  expect(races).toHaveLength(39);
  for (const type of ["caCommons", "provincialLegislature", "governor"]) {
    const family = races.filter((race) => race.electionType === type);
    expect(family.map((race) => race.state).sort()).toEqual([...CA_GEOGRAPHY_REGIONS].sort());
    expect(family.every((race) => ["active", "upcoming"].includes(race.status))).toBe(true);
    expect(family.every((race) => race.endTurn > 1)).toBe(true);
  }
});

it("retries Canadian scheduling without duplicates or changing US races", async () => {
  const before = await db
    .collection("elections")
    .find({ countryId: "US" })
    .sort({ _id: 1 })
    .toArray();
  const caBefore = await db
    .collection("elections")
    .find({ countryId: "CA" })
    .sort({ _id: 1 })
    .toArray();
  await ensureCAElections(new Date(0), 1);
  await ensureCAProvincialElections(new Date(0), 1);
  await ensureCAPremierElections(new Date(0), 1);
  expect(
    await db.collection("elections").find({ countryId: "CA" }).sort({ _id: 1 }).toArray()
  ).toEqual(caBefore);
  expect(
    await db.collection("elections").find({ countryId: "US" }).sort({ _id: 1 }).toArray()
  ).toEqual(before);
});
