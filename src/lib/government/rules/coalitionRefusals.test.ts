import { describe, expect, it } from "vitest";
import { DE_COALITION_REFUSALS_2027 } from "@/lib/countries/de/data/deCoalitionRefusals";
import { DE_BUNDESTAG_2027 } from "@/lib/seeds/reference/worldSeats2027";
import { deParties } from "@/lib/countries/de/data/deParties";
import { lowerChamberMajorityThreshold } from "@/lib/legislature/lowerChamberSeats";
import { chooseAutonomousCabinet, type AutonomousParty } from "./autonomousSupport";
import {
  advanceRefusalsAfterElection,
  expandRefusalSeeds,
  REFUSAL_LAPSE_CHANCE,
  refusalBlocks,
  refusalLapseRoll,
  type CoalitionRefusal,
} from "./coalitionRefusals";

const SLUG_TO_ABBR: Record<string, string> = {
  de_spd: "SPD",
  de_cdu: "CDU",
  de_csu: "CSU",
  de_greens: "GRN",
  de_linke: "LNK",
  de_afd: "AFD",
};

/** The 2027 Bundestag as the autonomous cabinet picker sees it, keyed by abbreviation. */
function bundestag2027(): AutonomousParty[] {
  const seats: Record<string, number> = {};
  for (const row of DE_BUNDESTAG_2027) {
    const abbr = SLUG_TO_ABBR[row.party];
    if (abbr) seats[abbr] = (seats[abbr] ?? 0) + (row.seatsHeld ?? 1);
  }
  return Object.entries(seats).map(([id, n]) => {
    const seed = deParties.find((p) => p.abbreviation === id)!;
    return { id, seats: n, economic: seed.economicPosition, social: seed.socialPosition };
  });
}

describe("coalition refusals", () => {
  const refusals = expandRefusalSeeds(DE_COALITION_REFUSALS_2027);

  it("expands authored refusals into directed pairs that block both ways", () => {
    expect(
      expandRefusalSeeds([{ party: "A", refuses: ["B", "A"], shunnedBy: ["C", "C"] }])
    ).toEqual([
      { refuser: "A", refused: "B", consecutiveLosses: 0 },
      { refuser: "C", refused: "A", consecutiveLosses: 0 },
    ]);
    expect(refusalBlocks(refusals, "CDU", "AFD")).toBe(true);
    expect(refusalBlocks(refusals, "AFD", "CSU")).toBe(true);
    expect(refusalBlocks(refusals, "CDU", "SPD")).toBe(false);
  });

  it("left unchecked, the 2027 Union governs with the AfD", () => {
    const threshold = lowerChamberMajorityThreshold(630);
    const parties = bundestag2027();
    const cabinet = chooseAutonomousCabinet(parties, ["CDU", "CSU", "SPD", "AFD"], threshold);
    expect(cabinet?.leadPartyId).toBe("CDU");
    expect(cabinet?.supporting).toContain("AFD");
  });

  it("with the AfD refused, the Union forms a 328-seat majority with the SPD", () => {
    const threshold = lowerChamberMajorityThreshold(630);
    const parties = bundestag2027();
    const cabinet = chooseAutonomousCabinet(
      parties,
      ["CDU", "CSU", "SPD", "AFD", "GRN", "LNK"],
      threshold,
      (a, b) => refusalBlocks(refusals, a, b)
    );
    expect(cabinet).toMatchObject({ leadPartyId: "CDU", seats: 328 });
    expect([...(cabinet?.supporting ?? [])].sort()).toEqual(["CDU", "CSU", "SPD"]);
    expect(cabinet?.seats).toBeGreaterThanOrEqual(threshold);
    expect(cabinet?.abstaining).not.toContain("AFD");
  });

  it("falls back to a minority when no refusal-free majority exists", () => {
    const parties: AutonomousParty[] = [
      { id: "A", seats: 50, economic: 0, social: 0 },
      { id: "B", seats: 30, economic: 1, social: 1 },
      { id: "C", seats: 20, economic: -5, social: -5 },
    ];
    expect(chooseAutonomousCabinet(parties, ["A"], 51)).toMatchObject({
      supporting: ["A", "B"],
      seats: 80,
    });
    const blocked = (a: string, b: string) =>
      refusalBlocks([{ refuser: "A", refused: "B", consecutiveLosses: 0 }], a, b);
    // No wider partner sits within reach, so A governs alone, and B, which A
    // refuses, is not counted as tolerating it.
    expect(chooseAutonomousCabinet(parties, ["A"], 51, blocked)).toMatchObject({
      leadPartyId: "A",
      supporting: ["A"],
      abstaining: [],
      seats: 50,
    });
  });
});

describe("refusal lapse", () => {
  const base: CoalitionRefusal = { refuser: "CDU", refused: "AFD", consecutiveLosses: 0 };

  it("counts consecutive losses only while the refused party leads", () => {
    const lost = advanceRefusalsAfterElection({
      refusals: [base],
      previousSeats: { CDU: 164, AFD: 152 },
      currentSeats: { CDU: 150, AFD: 170 },
      electionKey: "bundestag:1",
      scope: "DE",
    });
    expect(lost.refusals).toEqual([{ ...base, consecutiveLosses: 1 }]);

    const lostButLeads = advanceRefusalsAfterElection({
      refusals: [{ ...base, consecutiveLosses: 1 }],
      previousSeats: { CDU: 190, AFD: 152 },
      currentSeats: { CDU: 180, AFD: 160 },
      electionKey: "bundestag:2",
      scope: "DE",
    });
    expect(lostButLeads.refusals).toEqual([{ ...base, consecutiveLosses: 0 }]);

    const gained = advanceRefusalsAfterElection({
      refusals: [{ ...base, consecutiveLosses: 1 }],
      previousSeats: { CDU: 150, AFD: 170 },
      currentSeats: { CDU: 155, AFD: 180 },
      electionKey: "bundestag:3",
      scope: "DE",
    });
    expect(gained.refusals).toEqual([{ ...base, consecutiveLosses: 0 }]);
  });

  it("rolls to lapse on the second consecutive loss, deterministically", () => {
    // Find one election key that lapses and one that holds, so both outcomes
    // are exercised without depending on a particular hash value.
    const keys = Array.from({ length: 40 }, (_, i) => `bundestag:${i}`);
    const roll = (key: string) => refusalLapseRoll(`DE|CDU|AFD|${key}`);
    const lapseKey = keys.find((k) => roll(k) < REFUSAL_LAPSE_CHANCE)!;
    const holdKey = keys.find((k) => roll(k) >= REFUSAL_LAPSE_CHANCE)!;
    const input = {
      refusals: [{ ...base, consecutiveLosses: 1 }],
      previousSeats: { CDU: 150, AFD: 170 },
      currentSeats: { CDU: 140, AFD: 185 },
      scope: "DE",
    };

    const lapsed = advanceRefusalsAfterElection({ ...input, electionKey: lapseKey });
    expect(lapsed.refusals).toEqual([]);
    expect(lapsed.lapsed).toEqual([{ ...base, consecutiveLosses: 2 }]);
    expect(advanceRefusalsAfterElection({ ...input, electionKey: lapseKey })).toEqual(lapsed);

    const held = advanceRefusalsAfterElection({ ...input, electionKey: holdKey });
    expect(held.refusals).toEqual([{ ...base, consecutiveLosses: 2 }]);
    expect(held.lapsed).toEqual([]);
  });

  it("never lapses after a single loss", () => {
    for (let i = 0; i < 20; i++) {
      const result = advanceRefusalsAfterElection({
        refusals: [base],
        previousSeats: { CDU: 164, AFD: 152 },
        currentSeats: { CDU: 150, AFD: 170 },
        electionKey: `bundestag:${i}`,
        scope: "DE",
      });
      expect(result.lapsed).toEqual([]);
    }
  });
});
