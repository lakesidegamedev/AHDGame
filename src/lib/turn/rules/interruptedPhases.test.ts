import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BASE_TURN_PHASE_NAMES } from "@/simulation/phases/turnPhaseNames";
import {
  RERUN_SAFE_WHEN_INTERRUPTED,
  isRerunSafeWhenInterrupted,
  SAFE_WHEN_INTERRUPTED,
  classifyInterruptedPhases,
  isSafeWhenInterrupted,
} from "./interruptedPhases";

/** Every step name the turn registry runs, plus the declared base list. */
function knownTurnSteps(): Set<string> {
  const dir = join(process.cwd(), "src/simulation/phases");
  const names = new Set<string>(BASE_TURN_PHASE_NAMES);
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const text = readFileSync(join(dir, file), "utf8");
    for (const m of text.matchAll(/runPhase\(\s*"(\w+)"/g)) names.add(m[1]);
  }
  return names;
}

describe("allow list", () => {
  it("names only steps that exist, each with a reason", () => {
    const known = knownTurnSteps();
    for (const [phase, reason] of Object.entries(SAFE_WHEN_INTERRUPTED)) {
      expect(known.has(phase), `${phase} is not a turn step`).toBe(true);
      expect(reason.length).toBeGreaterThan(5);
    }
  });
  it("never lists a step that moves money", () => {
    for (const phase of [
      "bondTurn",
      "treasuryTurn",
      "corporationTurn",
      "fundGeneration",
      "savingsInterestTurn",
      "pensionTurn",
      "caucusTax",
      "playerIncomeTax",
      "bankingTurn",
      "lineOfCreditTurn",
    ])
      expect(isSafeWhenInterrupted(phase)).toBe(false);
  });
});

describe("rerun-safe list", () => {
  it("names only steps that exist, each with a reason, and not also on the skip list", () => {
    const known = knownTurnSteps();
    for (const [phase, reason] of Object.entries(RERUN_SAFE_WHEN_INTERRUPTED)) {
      expect(known.has(phase), `${phase} is not a turn step`).toBe(true);
      expect(reason.length).toBeGreaterThan(10);
      expect(isSafeWhenInterrupted(phase)).toBe(false);
    }
  });
  it("lists the steps proven so far", () => {
    expect(Object.keys(RERUN_SAFE_WHEN_INTERRUPTED)).toEqual([
      "treasuryTurn",
      "savingsInterestTurn",
      "pensionTurn",
    ]);
    expect(isRerunSafeWhenInterrupted("bondTurn")).toBe(false);
  });
});

describe("classifyInterruptedPhases", () => {
  it("treats snapshots as safe", () => {
    expect(classifyInterruptedPhases(["approvalSnapshot", "portfolioSnapshot"])).toEqual({
      safe: ["approvalSnapshot", "portfolioSnapshot"],
      moneyMoving: [],
    });
  });
  it("treats decay counters as safe", () => {
    expect(classifyInterruptedPhases(["turnoutDecay", "metricDecay"]).moneyMoving).toEqual([]);
  });
  it("treats activity and telemetry as safe", () => {
    expect(classifyInterruptedPhases(["activityLogging", "researchTelemetry"]).moneyMoving).toEqual(
      []
    );
  });
  it("fails closed on an unknown or new step", () => {
    expect(classifyInterruptedPhases(["someBrandNewPhase"]).moneyMoving).toEqual([
      "someBrandNewPhase",
    ]);
  });
  it("holds the interrupted set from the kill -9 mid bondTurn rehearsal", () => {
    const row5 = [
      "bannedShareholderRelease",
      "inactiveShareholderShareRelease",
      "autoDisasterTurn",
      "autoCrisisTurn",
      "coldWarTension",
      "autoSectorSeed",
      "extractionAutoStrategy",
      "fundGeneration",
      "actionRefresh",
      "nppCorporateAttacks",
      "offTypeHandover",
      "unionsTurn",
      "nppUnionBehavior",
      "decolonization",
      "partyInfluenceTurn",
      "caucusTax",
      "treasuryTurn",
      "departmentProgramSettlement",
      "nppFundGeneration",
      "savingsInterestTurn",
      "npcBankPolicyTurn",
      "savingsShadowTurn",
      "pensionTurn",
      "prospectingResolution",
      "macroCountryTurn",
      "sphereSponsorTurn",
      "bondTurn",
      "commodityPrices",
    ];
    const result = classifyInterruptedPhases(row5);
    expect(result.moneyMoving.length).toBe(row5.length);
    expect(result.moneyMoving).toContain("bondTurn");
  });
  it("mixed set holds on the money step only", () => {
    expect(classifyInterruptedPhases(["approvalSnapshot", "bondTurn"])).toEqual({
      safe: ["approvalSnapshot"],
      moneyMoving: ["bondTurn"],
    });
  });
});
