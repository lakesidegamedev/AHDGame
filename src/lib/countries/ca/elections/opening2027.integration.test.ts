import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { getDb } from "@/lib/mongodb";
import { ensureChamberElections } from "@/lib/elections/scheduling/chamberSpawner";
import { pickNextCanonicalCycle } from "@/lib/elections/canonicalCycle";
import { electionToLarpYear } from "@/lib/utils/formatters";
import { caRegions2027 } from "../data/caRegions2027";
import { CA_PROVINCIAL_LEGISLATURES } from "../data/caProvincialLegislatures";
import { provincialCycle1EndTurn } from "../rules/provincialLegislature";
import { CA_PROVINCIAL_SPEC } from "./chamberSpecs";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/discordWebhooks", () => ({
  sendCountryGameEventMultiple: vi.fn(),
  DISCORD_COLORS: {},
}));
vi.mock("@/lib/countryAccess", async (original) => ({
  ...(await original<typeof import("@/lib/countryAccess")>()),
  getCountryAccessFromDb: vi.fn(async () => ({ status: "active", nppGoverned: false })),
}));

const ctx = { preset: "2027-default", startingYear: 2027, preIterationTurns: 0 };
describe("Canadian opening provincial races", () => {
  let db: ReturnType<typeof createInMemoryDb>;
  beforeEach(() => {
    db = createInMemoryDb();
    db.seed(
      "states",
      caRegions2027.map((region) => ({ ...region }))
    );
    db.seed("gameState", [
      { _id: "current", ...ctx, currentYear: 2027, currentTurn: 1, preIterationActive: false },
    ]);
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
  });
  it("spawns all thirteen first cycles on the actual first gameplay turn", async () => {
    const races = await ensureChamberElections(CA_PROVINCIAL_SPEC, new Date(0), 2);
    expect(races).toHaveLength(13);
    for (const race of races) {
      expect(race.cycle, race.state).toBe(1);
      expect(race.endTurn, race.state).toBe(provincialCycle1EndTurn(race.state, ctx));
      expect(race.electionYear, race.state).toBe(
        CA_PROVINCIAL_LEGISLATURES[race.state].nextElectionYear
      );
      expect(race.electionYear).toBe(2027 + Math.floor((race.endTurn! - 1) / 48));
    }
    expect(await ensureChamberElections(CA_PROVINCIAL_SPEC, new Date(0), 2)).toHaveLength(0);
  });
  it.each([1, 2])(
    "retains opening-year races at turn %s without changing later-cycle minima",
    (turn) => {
      const params = {
        countryId: "CA" as const,
        electionType: "provincialLegislature",
        state: "CA_AB",
        prevCycle: 0,
        ctx,
        customCycle1EndTurn: 48,
      };
      expect(pickNextCanonicalCycle({ ...params, currentTurn: turn })?.endTurn).toBe(48);
      expect(pickNextCanonicalCycle({ ...params, currentTurn: 3 })?.endTurn).toBe(240);
      expect(
        pickNextCanonicalCycle({
          ...params,
          ctx: { ...ctx, preIterationTurns: 10 },
          customCycle1EndTurn: 58,
          currentTurn: 12,
        })?.endTurn
      ).toBe(58);
    }
  );
  it("labels later provincial cycles by their own anchors", () => {
    for (const [region, data] of Object.entries(CA_PROVINCIAL_LEGISLATURES))
      expect(electionToLarpYear("provincialLegislature", 2, null, null, ctx, "CA", region)).toBe(
        data.nextElectionYear + 4
      );
  });
});
