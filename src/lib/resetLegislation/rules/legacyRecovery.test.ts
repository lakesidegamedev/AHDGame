import { describe, expect, it } from "vitest";
import { planLegacyRecovery, type RecoverySource } from "./legacyRecovery";
function source(patch: Partial<RecoverySource> = {}): RecoverySource {
  return {
    billId: "bill",
    country: "US",
    regionId: "GA",
    sourceId: "us.health.prevention.primary",
    policyId: "policy",
    optionId: "l4",
    optionIndex: 4,
    optionCount: 5,
    enactedTurn: 10,
    title: "Public health",
    description: "Prevention",
    annualCost: 1001,
    currentBillId: "bill",
    currentKind: "bill",
    settlement: {
      programId: "legacy",
      legislationTypeId: "us.health.prevention.primary",
      policyOptionId: "l4",
      authorizedCost: 1001,
      fundedAmount: 1001,
      unfundedAmount: 0,
      implementationFactor: 1,
      obligationPriority: 5,
      lastSettledTurn: 50,
      validThroughTurn: 150,
    },
    ...patch,
  };
}
const plan = (
  sources: RecoverySource[],
  existing: Parameters<typeof planLegacyRecovery>[0]["existing"] = []
) => planLegacyRecovery({ turn: 100, sources, existing });
describe("legacy governor recovery", () => {
  it.each(["US", "UK"] as const)("recovers %s without changing the allocation", (country) => {
    const result = plan([
      source({
        country,
        sourceId: country.toLowerCase() + ".health.prevention.primary",
        settlement: undefined,
      }),
    ]);
    expect(result.targets[0]).toMatchObject({
      familyId: "L19",
      choice: "far_left",
      annualAllocation: 1001,
      fundedAmount: 0,
    });
    expect(result.annualTransferred).toBe(result.annualRetired);
  });
  it("divides Japanese nursery and school services, with exact integer reconciliation", () => {
    const result = plan([
      source({
        country: "JP",
        sourceId: "jp_regional_education",
        optionId: "jp_regional_education_opt_0",
        optionIndex: 0,
        optionCount: 7,
        settlement: undefined,
      }),
    ]);
    expect(result.targets.map((t) => [t.familyId, t.choice, t.annualAllocation])).toEqual([
      ["L38", "far_left", 601],
      ["L10", "far_left", 400],
    ]);
    expect(result.annualTransferred).toBe(1001);
    expect(result.targets.reduce((s, t) => s + t.responseScale, 0)).toBe(1);
  });
  it("never revives a law overwritten by an executive order", () => {
    const result = plan([source({ currentKind: "order" })]);
    expect(result.targets).toEqual([]);
    expect(result.decisions[0]!.retire).toBe(false);
  });
  it("preserves a newer v2 law and retires its duplicate legacy claim", () => {
    const result = plan(
      [source()],
      [{ country: "US", regionId: "GA", familyId: "L19", effectiveTurn: 90 }]
    );
    expect(result.targets).toEqual([]);
    expect(result.decisions[0]).toMatchObject({ reason: "superseded-by-newer-v2", retire: true });
  });
  it("allows a later legacy decision to update an earlier v2 decision", () => {
    expect(
      plan([source()], [{ country: "US", regionId: "GA", familyId: "L19", effectiveTurn: 2 }])
        .targets
    ).toHaveLength(1);
  });
  it("does not mistake another country's program for a local replacement", () => {
    expect(
      plan([source()], [{ country: "JP", regionId: "GA", familyId: "L19", effectiveTurn: 90 }])
        .targets
    ).toHaveLength(1);
  });
  it("holds a partly replaced service bundle rather than dropping another service", () => {
    const result = plan(
      [
        source({
          country: "JP",
          sourceId: "jp_regional_education",
          optionId: "jp_regional_education_opt_0",
          optionIndex: 0,
          optionCount: 7,
          settlement: undefined,
        }),
      ],
      [{ country: "JP", regionId: "GA", familyId: "L10", effectiveTurn: 90 }]
    );
    expect(result.targets).toEqual([]);
    expect(result.decisions[0]!.retire).toBe(false);
  });
  it("rejects stale option funding instead of borrowing its receipt", () => {
    const s = source();
    s.settlement!.policyOptionId = "l1";
    expect(plan([s]).decisions[0]!.reason).toBe("conflicting-funding-evidence");
  });
  it("credits only the verified historical receipt window, never the later stale gap", () => {
    const s = source();
    s.settlement!.validThroughTurn = 51;
    expect(plan([s]).targets[0]!.verifiedMissedTurns).toBe(2);
  });
  it("caps documented missed funding to one game year", () => {
    expect(plan([source()]).targets[0]!.verifiedMissedTurns).toBe(48);
  });
  it("does not invent an appropriation when cost evidence is absent", () => {
    expect(plan([source({ annualCost: null })]).targets).toEqual([]);
  });
  it("keeps taxes and unsupported laws out of the migration", () => {
    expect(plan([source({ sourceId: "us.tax.stateIncomeTax" })]).targets).toEqual([]);
  });
  it("chooses the latest intent when two source policies share a family", () => {
    const a = source({
      sourceId: "us.education.choice.primary",
      optionId: "l4",
      settlement: undefined,
    });
    const b = source({
      billId: "later",
      currentBillId: "later",
      policyId: "later-policy",
      sourceId: "us.education.universalSchooling.primary",
      enactedTurn: 30,
      settlement: undefined,
    });
    const result = plan([a, b]);
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0]).toMatchObject({
      familyId: "L10",
      choice: "far_left",
      annualAllocation: 2002,
      responseScale: 1,
    });
  });
  it("rejects repeated policy identities", () => {
    expect(() => plan([source(), source()])).toThrow("Duplicate recovery policy");
  });
});
