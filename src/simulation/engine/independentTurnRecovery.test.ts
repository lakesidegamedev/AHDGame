import { describe, expect, it, vi } from "vitest";
import { executeTurnAdapters, isIndependentPoliticalPhase } from "./independentTurnRecovery";
import type { TurnExecutionContext, TurnPhaseAdapter, TurnPhaseRuntime } from "./types";
import { TurnMustStopError } from "@/lib/turn/turnMustStop";
import { createTurnPhaseTelemetry } from "./phaseTelemetry";

function fixture(error?: Error) {
  const calls: string[] = [];
  const currentPhaseRef = { current: "corporationTurn" as string | null };
  const context = { warnings: [] } as unknown as TurnExecutionContext;
  const runtime = {
    drainTimedOutPhases: vi.fn(async () => {
      calls.push("drained");
    }),
  } as unknown as TurnPhaseRuntime;
  const independent = { drainTimedOutPhases: vi.fn(async () => {}) } as unknown as TurnPhaseRuntime;
  const createIndependentRuntime = vi.fn(() => independent);
  const adapters: TurnPhaseAdapter[] = [
    "resourceAndFinanceStart",
    "demographicsAndPartySetup",
    "billsCampaignsAndActivity",
    "electionResolutionAndGovernment",
    "electionCoverageAndSuccession",
    "fiscalYearBoundary",
    "playerIncomeTax",
  ].map((key) => ({
    key,
    async execute(_context, active) {
      calls.push(key);
      if (key === "resourceAndFinanceStart" && error) throw error;
      if (error) expect(active).toBe(independent);
      currentPhaseRef.current = key;
    },
  }));
  return {
    input: { adapters, context, runtime, createIndependentRuntime, currentPhaseRef },
    calls,
  };
}

describe("independent turn recovery", () => {
  it("runs the normal turn unchanged", async () => {
    const { input, calls } = fixture();
    await executeTurnAdapters(input);
    expect(calls).toEqual(input.adapters.map((a) => a.key));
    expect(input.createIndependentRuntime).not.toHaveBeenCalled();
  });
  it("drains the market then completes the political chain, retaining the failure", async () => {
    const error = new TurnMustStopError("corporationTurn", new Error("deadline"));
    const { input, calls } = fixture(error);
    input.currentPhaseRef.current = "fundGeneration";
    await expect(executeTurnAdapters(input)).rejects.toBe(error);
    expect(calls).toEqual([
      "resourceAndFinanceStart",
      "drained",
      "demographicsAndPartySetup",
      "billsCampaignsAndActivity",
      "electionResolutionAndGovernment",
      "electionCoverageAndSuccession",
    ]);
    expect(input.currentPhaseRef.current).toBe("corporationTurn");
  });
  it.each([new Error("unknown partial write"), new TurnMustStopError("bondTurn", "missing")])(
    "does not bypass an unknown or unrelated critical failure",
    async (error) => {
      const { input, calls } = fixture(error);
      await expect(executeTurnAdapters(input)).rejects.toBe(error);
      expect(calls).toEqual(["resourceAndFinanceStart"]);
    }
  );
  it("does not resolve elections after the independent campaign chain aborts", async () => {
    const error = new TurnMustStopError("corporationTurn", "deadline");
    const { input, calls } = fixture(error);
    input.adapters[2].execute = async () => {
      throw new Error("campaign failed");
    };
    await expect(executeTurnAdapters(input)).rejects.toBe(error);
    expect(calls).not.toContain("electionResolutionAndGovernment");
    expect(input.context.warnings).toEqual(["independentTurnRecovery: campaign failed"]);
  });
  it("excludes money writers and territorial changes from independent execution", () => {
    for (const name of [
      "treasuryTurn",
      "lineOfCreditTurn",
      "billLifecycle",
      "playerIncomeTax",
      "parliamentaryGovernmentFormation",
      "settlement",
      "internationalOrganizations",
      "detectPreIterationComplete",
    ])
      expect(isIndependentPoliticalPhase(name)).toBe(false);
    for (const name of ["campaignTurn", "voteAccumulation", "electionResolution"])
      expect(isIndependentPoliticalPhase(name)).toBe(true);
  });
  it("also blocks elections when runPhase recorded a campaign failure without throwing", async () => {
    const error = new TurnMustStopError("corporationTurn", "deadline");
    const { input, calls } = fixture(error);
    input.adapters[2].execute = async () => {
      input.context.phaseStatuses = {
        campaignTurn: createTurnPhaseTelemetry(new Date(0), "failed"),
      };
    };
    await expect(executeTurnAdapters(input)).rejects.toBe(error);
    expect(calls).not.toContain("electionResolutionAndGovernment");
    expect(input.context.warnings[0]).toContain("campaignTurn");
  });
});
