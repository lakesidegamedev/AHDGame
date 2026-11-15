import { describe, expect, it } from "vitest";
import { BASE_TURN_PHASE_NAMES } from "@/simulation/phases/turnPhaseNames";
import {
  SAFE_WHEN_INTERRUPTED,
  classifyInterruptedPhases,
  isSafeWhenInterrupted,
} from "./interruptedPhases";

describe("allow list", () => {
  it("names only steps that exist, each with a reason", () => {
    const known = new Set<string>(BASE_TURN_PHASE_NAMES);
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
