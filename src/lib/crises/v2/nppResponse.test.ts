import { describe, expect, it } from "vitest";
import { makeDefinition } from "./testFixtures";
import {
  NPP_APPROVAL_FLOOR,
  NPP_EXECUTIVE_ROLES,
  chooseNppLevers,
  interventionismFromPersonality,
  seededRng,
  type NppResponseInput,
} from "./nppResponse";
import type { CrisisRole } from "./types";

function input(patch: Partial<NppResponseInput> = {}): NppResponseInput {
  const def = makeDefinition();
  return {
    def,
    stage: "peak",
    severity: 75,
    roles: new Set<CrisisRole>(NPP_EXECUTIVE_ROLES),
    blockedLeverIds: new Set(),
    budget: { treasuryBalance: 10_000, output: 1_000_000, approval: 60 },
    interventionism: 0.5,
    rng: seededRng("seed"),
    ...patch,
  };
}

describe("NPP lever policy", () => {
  it("picks affordable executive levers and never legislature levers", () => {
    const picks = chooseNppLevers(input());
    expect(picks.length).toBeGreaterThan(0);
    for (const pick of picks) {
      expect(NPP_EXECUTIVE_ROLES).toContain(pick.lever.role);
      expect(pick.lever.id).not.toBe("relief-bill");
    }
    const roles = picks.map((pick) => pick.lever.role);
    expect(new Set(roles).size).toBe(roles.length);
  });

  it("never takes a lever paid from an action budget, which an NPP does not have", () => {
    const base = makeDefinition();
    const def = {
      ...base,
      levers: base.levers.map((lever) => ({
        ...lever,
        cost: { ...lever.cost, politicalCapital: 2 },
      })),
    };
    expect(chooseNppLevers(input({ def }))).toEqual([]);
  });

  it("skips levers the treasury cannot bear", () => {
    const picks = chooseNppLevers(
      input({ budget: { treasuryBalance: 50, approval: 60 }, severity: 90 })
    );
    expect(picks.map((pick) => pick.lever.id)).not.toContain("stimulus");
  });

  it("will not spend approval below the floor", () => {
    const picks = chooseNppLevers(
      input({ budget: { treasuryBalance: 100_000, approval: NPP_APPROVAL_FLOOR + 0.5 } })
    );
    expect(picks.map((pick) => pick.lever.id)).not.toContain("stimulus");
  });

  it("does nothing with no role, on cooldown, or when the crisis is quiet", () => {
    expect(chooseNppLevers(input({ roles: new Set() }))).toEqual([]);
    expect(
      chooseNppLevers(input({ blockedLeverIds: new Set(["stimulus", "rate-cut", "relief-bill"]) }))
    ).toEqual([]);
    expect(chooseNppLevers(input({ severity: 10, stage: "signal" }))).toEqual([]);
  });

  it("is deterministic for a seed and bounded by severity", () => {
    const a = chooseNppLevers(input({ severity: 50, rng: seededRng("x") }));
    const b = chooseNppLevers(input({ severity: 50, rng: seededRng("x") }));
    expect(a.map((p) => p.lever.id)).toEqual(b.map((p) => p.lever.id));
    expect(chooseNppLevers(input({ severity: 50 })).length).toBeLessThanOrEqual(1);
  });

  it("acts earlier when the government is interventionist", () => {
    const eager = interventionismFromPersonality({ ambition: 100, stubbornness: 0 });
    const cautious = interventionismFromPersonality({ ambition: 0, stubbornness: 100 });
    const quiet = { severity: 35, stage: "onset" as const };
    expect(chooseNppLevers(input({ ...quiet, interventionism: eager, rng: () => 0 })).length).toBe(
      1
    );
    expect(chooseNppLevers(input({ ...quiet, interventionism: cautious, rng: () => 0 }))).toEqual(
      []
    );
  });
});
