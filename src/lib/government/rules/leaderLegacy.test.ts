import { describe, expect, it } from "vitest";
import {
  LEGACY_HORIZON_TURNS,
  LEGACY_HALF_LIFE_TURNS,
  MAX_LEGACY_APPROVAL_POINTS,
  MAX_LEGACY_VOTE_PCT,
  approvalPointsByParty,
  buildLegacyViewRow,
  computeLegacyScore,
  currentVotePct,
  legacyAdjustedApproval,
  legacyApprovalPoints,
  legacyDecay,
  legacyNewsLine,
  legacyTier,
  legacyVotePct,
} from "./leaderLegacy";
import { crisisPointsForLeader, scarMagnitudeForTerm } from "./leaderLegacyInputs";

const base = {
  tenureTurns: 192,
  exitApproval: 50,
  lawsEnacted: 0,
  crisisPoints: 0,
  scarMagnitude: 0,
};

describe("computeLegacyScore", () => {
  it("is neutral for a neutral term", () => {
    expect(computeLegacyScore(base).score).toBe(0);
  });

  it("rewards approval, laws and crisis credit, and stays inside the bounds", () => {
    const best = computeLegacyScore({
      tenureTurns: 192,
      exitApproval: 100,
      lawsEnacted: 500,
      crisisPoints: 100,
      scarMagnitude: 0,
    });
    expect(best.score).toBeGreaterThan(80);
    expect(best.score).toBeLessThanOrEqual(100);
    const worst = computeLegacyScore({
      tenureTurns: 192,
      exitApproval: 0,
      lawsEnacted: 0,
      crisisPoints: -100,
      scarMagnitude: 5,
    });
    expect(worst.score).toBeLessThan(-79);
    expect(worst.score).toBeGreaterThanOrEqual(-100);
  });

  it("weighs approval most and scars least", () => {
    const approval = computeLegacyScore({ ...base, exitApproval: 100 }).score;
    const scars = computeLegacyScore({ ...base, scarMagnitude: 5 }).score;
    expect(approval).toBeCloseTo(40, 0);
    expect(scars).toBeCloseTo(-10, 0);
  });

  it("treats unknown approval as neutral", () => {
    expect(computeLegacyScore({ ...base, exitApproval: null }).components.approval).toBe(0);
  });

  it("scales a short term down", () => {
    const full = computeLegacyScore({ ...base, exitApproval: 90 }).score;
    const short = computeLegacyScore({ ...base, exitApproval: 90, tenureTurns: 6 }).score;
    expect(short).toBeCloseTo(full / 4, 0);
    expect(computeLegacyScore({ ...base, exitApproval: 90, tenureTurns: 0 }).score).toBe(0);
  });

  it("ignores non-finite inputs rather than propagating NaN", () => {
    const out = computeLegacyScore({ ...base, crisisPoints: Number.NaN, lawsEnacted: -3 });
    expect(Number.isFinite(out.score)).toBe(true);
  });
});

describe("decay", () => {
  it("halves every half-life and ends at the horizon", () => {
    expect(legacyDecay(0)).toBe(1);
    expect(legacyDecay(LEGACY_HALF_LIFE_TURNS)).toBeCloseTo(0.5, 5);
    expect(legacyDecay(LEGACY_HORIZON_TURNS)).toBe(0);
    expect(legacyDecay(LEGACY_HORIZON_TURNS - 1)).toBeGreaterThan(0.12);
  });

  it("treats a future or invalid age as no decay", () => {
    expect(legacyDecay(-5)).toBe(1);
    expect(legacyDecay(Number.NaN)).toBe(1);
  });

  it("bounds the shifts and drops a negligible one", () => {
    expect(legacyVotePct(100)).toBe(MAX_LEGACY_VOTE_PCT);
    expect(legacyVotePct(-250)).toBe(-MAX_LEGACY_VOTE_PCT);
    expect(legacyApprovalPoints(100)).toBe(MAX_LEGACY_APPROVAL_POINTS);
    expect(currentVotePct({ votePct: 2, endTurn: 10 }, 10)).toBe(2);
    expect(
      currentVotePct({ votePct: 0.05, endTurn: 10 }, 10 + 3 * LEGACY_HALF_LIFE_TURNS - 1)
    ).toBe(0);
  });
});

describe("approvalPointsByParty", () => {
  it("sums per party and never exceeds one legacy's bound", () => {
    const points = approvalPointsByParty(
      [
        { partyId: "1", approvalPoints: 5, endTurn: 100 },
        { partyId: "1", approvalPoints: 5, endTurn: 100 },
        { partyId: "2", approvalPoints: -2, endTurn: 100 },
      ],
      100
    );
    expect(points.get("1")).toBe(MAX_LEGACY_APPROVAL_POINTS);
    expect(points.get("2")).toBeCloseTo(-2, 5);
  });
});

describe("legacyAdjustedApproval", () => {
  it("adds the shift and stays inside 0..100", () => {
    expect(legacyAdjustedApproval(40, -5)).toBe(35);
    expect(legacyAdjustedApproval(98, 5)).toBe(100);
    expect(legacyAdjustedApproval(40, undefined)).toBe(40);
    expect(legacyAdjustedApproval(null, 3)).toBeNull();
  });
});

describe("presentation", () => {
  it("tiers a score", () => {
    expect(legacyTier(60)).toBe("great");
    expect(legacyTier(20)).toBe("good");
    expect(legacyTier(0)).toBe("mixed");
    expect(legacyTier(-20)).toBe("poor");
    expect(legacyTier(-60)).toBe("disastrous");
  });

  it("writes a news line without dashes", () => {
    const line = legacyNewsLine({
      leaderName: "A. Leader",
      countryName: "Freedonia",
      score: -30,
      reason: "vacancy",
    });
    expect(line).toContain("A. Leader left office in Freedonia");
    expect(line).not.toMatch(/[\u2013\u2014]/);
  });

  it("builds a view row with the decayed effect", () => {
    const row = buildLegacyViewRow(
      {
        _id: "US:x:1",
        leaderName: "X",
        partyId: "3",
        startTurn: 1,
        endTurn: 100,
        reason: "term_end",
        score: 50,
        components: { approval: 0.5, laws: 0.5, crisis: 0, scars: 0 },
        inputs: { lawsEnacted: 9, exitApproval: 60 },
        votePct: 1,
        approvalPoints: 2.5,
      },
      100 + LEGACY_HALF_LIFE_TURNS
    );
    expect(row.remaining).toBeCloseTo(0.5, 5);
    expect(row.votePct).toBeCloseTo(0.5, 2);
    expect(row.tier).toBe("great");
  });
});

describe("crisis inputs", () => {
  const entry = (turn: number, holderId: string, leverId: string | null) => ({
    turn,
    stage: "peak" as const,
    role: "headOfState" as const,
    holderId,
    leverId,
    cost: {},
    mitigation: 1,
    severity: 90,
  });

  it("charges idle turns to the holder and credits action, only inside the term", () => {
    const idle = Array.from({ length: 8 }, (_, i) => entry(50 + i, "p1", null));
    const acted = Array.from({ length: 8 }, (_, i) => entry(50 + i, "p2", "lever"));
    const crises = [{ startTurn: 40, v2: { ledger: [...idle, ...acted] } }];
    expect(crisisPointsForLeader(crises, "p1", 0)).toBeLessThan(0);
    expect(crisisPointsForLeader(crises, "p2", 0)).toBeGreaterThan(0);
    expect(crisisPointsForLeader(crises, "p1", 100)).toBe(0);
  });

  it("sums scars only for crises that began in the term", () => {
    const scar = {
      ruleId: "r",
      kind: "regionalOutput" as const,
      targetId: "US",
      magnitude: 0.05,
      createdTurn: 10,
      recoveryTurns: 100,
    };
    const crises = [
      { startTurn: 10, v2: { scars: [scar, scar] } },
      { startTurn: 500, v2: { scars: [scar] } },
    ];
    expect(scarMagnitudeForTerm(crises, 0, 200)).toBeCloseTo(0.1, 5);
  });
});
