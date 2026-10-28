import { describe, expect, it, vi } from "vitest";
import { TurnPhaseResultIncompleteError } from "@/simulation/engine/turnPhaseResumeResults";
import { resolveTurnEngine } from "@/simulation/engine/turnEngine";

const settleResetTreasuryCashTurn = vi.fn(async () => ({ countries: 1 }));
vi.mock("@/lib/resetFinance/settleCashTurn", () => ({
  settleResetTreasuryCashTurn: (...args: unknown[]) => settleResetTreasuryCashTurn(...(args as [])),
}));
vi.mock("@/lib/resetVersions/rules", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/resetVersions/rules")>()),
  resetSystemVersionsFrom: () => ({ metrics: "v2", legislation: "v2", cabinet: "v2" }),
}));
vi.mock("@/lib/extraction/featureFlag", () => ({
  isProspectingEnabled: async () => false,
  isContractIssuanceEnabled: async () => false,
}));

import { getTurnPhaseRegistry } from "@/simulation/phases/turnPhaseRegistry";

const COUNTERS = {
  bondsProcessed: 7,
  couponsPaid: 5,
  bondsMatured: 1,
  bondsDefaulted: 0,
  totalCouponsPaid: 1234.5,
  bondHistorySnapshots: 7,
  bondsAutoRestructured: 0,
  bondsAutoRefinanced: 0,
};
const FLOWS = {
  sovereignCashProceedsByCountry: { US: 1 },
  sovereignDebtFaceIssuedByCountry: { US: 1 },
  sovereignCouponPaidByCountry: { US: 1 },
  sovereignMaturityCashPaidByCountry: { US: 1 },
  sovereignDebtFaceRetiredByCountry: { US: 1 },
};

/** The real resourceAndFinanceStart adapter, with bondTurn returning `bond`. */
async function runWithBondResult(bond: unknown, bondEligible?: boolean) {
  settleResetTreasuryCashTurn.mockClear();
  const adapter = getTurnPhaseRegistry().find((entry) => entry.key === "resourceAndFinanceStart")!;
  const runtime = {
    runPhase: vi.fn(async (name: string, fn: () => Promise<unknown>) => {
      if (name === "bondTurn") return bond;
      if (name === "resetTreasuryCash") return fn();
      return null;
    }),
    markPhaseSkipped: vi.fn(async () => {}),
    requirePhaseResult: vi.fn((_phase: string, result: unknown) => result),
    resumeResultOutcome: vi.fn(() => "restored"),
    ...(bondEligible === undefined
      ? {}
      : { isPhaseEligible: vi.fn((phase: string) => phase !== "bondTurn" || bondEligible) }),
  };
  const context = {
    db: {},
    characters: [],
    config: null,
    engine: resolveTurnEngine({}).engine,
    gameNow: new Date(),
    stateMap: new Map(),
    gameState: { currentTurn: 11, forexEnabled: false },
    newTurn: 12,
    currentYear: 1991,
    phaseResults: {},
    warnings: [],
  } as never;
  await adapter.execute(context, runtime as never);
  return runtime;
}

describe("V2 treasury cash needs complete bond flows (#3429)", () => {
  it.each([
    ["all five flow maps missing", COUNTERS],
    ["one flow map missing", { ...COUNTERS, ...FLOWS, sovereignCouponPaidByCountry: undefined }],
  ])("rejects a restored result with %s before settlement", async (_label, bond) => {
    await expect(runWithBondResult(bond)).rejects.toBeInstanceOf(TurnPhaseResultIncompleteError);
    expect(settleResetTreasuryCashTurn).not.toHaveBeenCalled();
  });

  it("settles once from a complete result", async () => {
    await runWithBondResult({ ...COUNTERS, ...FLOWS });
    expect(settleResetTreasuryCashTurn).toHaveBeenCalledTimes(1);
  });

  it("skips settlement when a phase predicate kept bondTurn from running", async () => {
    const runtime = await runWithBondResult(null, false);
    expect(settleResetTreasuryCashTurn).not.toHaveBeenCalled();
    expect(runtime.requirePhaseResult).not.toHaveBeenCalled();
    expect(runtime.markPhaseSkipped).toHaveBeenCalledWith(
      "resetTreasuryCash",
      "conditional",
      expect.stringContaining("bondTurn")
    );
  });

  it("still demands the result when bondTurn was eligible", async () => {
    await expect(runWithBondResult(null, true)).rejects.toThrow();
    expect(settleResetTreasuryCashTurn).not.toHaveBeenCalled();
  });
});
