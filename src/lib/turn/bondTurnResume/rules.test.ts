import { describe, expect, it } from "vitest";
import { rebuildInterruptedBondTurnFlows, type BondTurnResumeEvidence } from "./rules";

const placement = (
  bond: string,
  countryId: string,
  face: number,
  cashPaid: number,
  status = "applied"
) => ({
  key: `sovereign-primary:placement:${bond}:384`,
  status,
  anyApplied: status === "applied",
  countryId,
  cashPaid,
  face,
});
const scheduled = (countryId: string, status = "applied") => ({
  key: `sovereign-primary:scheduled:${countryId}:384`,
  status,
  anyApplied: status === "applied",
  countryId,
  cashPaid: null,
  face: null,
});
const evidence = (overrides: Partial<BondTurnResumeEvidence> = {}): BondTurnResumeEvidence => ({
  turn: 384,
  treasuryCashLedgerEnabled: true,
  checkpoint: { atParIssues: [{ countryId: "US", face: 1_000_000 }] },
  issuedThisTurn: [],
  scheduledReceipts: [scheduled("US")],
  placementReceipts: [],
  ...overrides,
});

describe("rebuildInterruptedBondTurnFlows", () => {
  it("adds applied placements to the checkpointed at-par snapshot once", () => {
    const rebuilt = rebuildInterruptedBondTurnFlows(
      evidence({
        // The placement filled a bond issued this turn; the checkpoint predates it.
        issuedThisTurn: [{ countryId: "US", face: 1_400_000 }],
        placementReceipts: [
          placement("a".repeat(24), "US", 400_000, 380_000),
          placement("b".repeat(24), "UK", 200_000, 210_000),
        ],
      })
    );
    expect(rebuilt).toMatchObject({ ok: true, source: "checkpoint" });
    if (!rebuilt.ok) return;
    expect(rebuilt.result.sovereignCashProceedsByCountry).toEqual({
      US: 1_380_000,
      UK: 210_000,
    });
    expect(rebuilt.result.sovereignDebtFaceIssuedByCountry).toEqual({
      US: 1_400_000,
      UK: 200_000,
    });
    expect(rebuilt.result.sovereignCouponPaidByCountry).toEqual({});
    expect(rebuilt.result.sovereignMaturityCashPaidByCountry).toEqual({});
    expect(rebuilt.result.sovereignDebtFaceRetiredByCountry).toEqual({});
  });

  it("ignores placements the journal rejected before any cash moved", () => {
    const rebuilt = rebuildInterruptedBondTurnFlows(
      evidence({ placementReceipts: [placement("a".repeat(24), "US", 1, 1, "rejected")] })
    );
    expect(rebuilt.ok && rebuilt.result.sovereignCashProceedsByCountry).toEqual({
      US: 1_000_000,
    });
  });

  it("reads this turn's issues when the phase died before its checkpoint", () => {
    const rebuilt = rebuildInterruptedBondTurnFlows(
      evidence({
        checkpoint: null,
        issuedThisTurn: [
          { countryId: "US", face: 600_000 },
          { countryId: "US", face: 400_000 },
        ],
      })
    );
    expect(rebuilt).toMatchObject({
      ok: true,
      source: "issuance",
      result: { sovereignCashProceedsByCountry: { US: 1_000_000 } },
    });
  });

  it("returns empty flows for a turn with no issuance or placement", () => {
    const rebuilt = rebuildInterruptedBondTurnFlows(
      evidence({ checkpoint: null, scheduledReceipts: [] })
    );
    expect(rebuilt).toMatchObject({
      ok: true,
      result: { sovereignCashProceedsByCountry: {}, sovereignDebtFaceIssuedByCountry: {} },
    });
  });

  it.each<[string, Partial<BondTurnResumeEvidence>, RegExp]>([
    ["the cash ledger is off", { treasuryCashLedgerEnabled: false }, /ledger is off/],
    [
      "a placement is still partial",
      { placementReceipts: [placement("a".repeat(24), "US", 1, 1, "partial")] },
      /is partial/,
    ],
    [
      "a rejected placement moved cash",
      {
        placementReceipts: [
          { ...placement("a".repeat(24), "US", 1, 1, "rejected"), anyApplied: true },
        ],
      },
      /is rejected/,
    ],
    [
      "a placement landed without a checkpoint",
      {
        checkpoint: null,
        issuedThisTurn: [{ countryId: "US", face: 1_000_000 }],
        placementReceipts: [placement("a".repeat(24), "US", 1, 1)],
      },
      /no at-par checkpoint/,
    ],
    [
      "an issue has no applied scheduled receipt",
      {
        checkpoint: null,
        issuedThisTurn: [
          { countryId: "US", face: 1 },
          { countryId: "UK", face: 1 },
        ],
      },
      /do not match/,
    ],
    [
      "a placement receipt is unreadable",
      { placementReceipts: [{ ...placement("a".repeat(24), "US", 1, 1), face: null }] },
      /unreadable/,
    ],
  ])("refuses when %s", (_, overrides, reason) => {
    const rebuilt = rebuildInterruptedBondTurnFlows(evidence(overrides));
    expect(rebuilt.ok).toBe(false);
    if (!rebuilt.ok) expect(rebuilt.reason).toMatch(reason);
  });
});
