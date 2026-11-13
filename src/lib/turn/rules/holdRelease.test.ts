import { describe, expect, it } from "vitest";
import { buildStepPreview, type WriteProbeResult } from "./holdPreview";
import { planHoldRelease } from "./holdRelease";

const now = new Date("2027-01-01T00:00:00Z");
const held = { processingHoldReason: "held", processingHeldPhases: ["bondTurn", "treasuryTurn"] };
const found = (count: number): WriteProbeResult => ({
  label: "audit",
  status: "found",
  count,
  sums: {},
});
const unknownProbe: WriteProbeResult = { label: "audit", status: "unknown", reason: "off" };
const previewOf = (bond: WriteProbeResult, treasury: WriteProbeResult, token = "tok-12345") => ({
  previewToken: token,
  steps: [
    buildStepPreview("bondTurn", [bond], true),
    buildStepPreview("treasuryTurn", [treasury], true),
  ],
});
const clean = previewOf(found(0), found(0));
const ack = ["bondTurn", "treasuryTurn"];
const base = { acknowledge: ack, previewToken: "tok-12345" };

describe("planHoldRelease refusals", () => {
  it("refuses when nothing is held", () => {
    expect(planHoldRelease({}, { mode: "rerun", acknowledge: [] }, now, null).ok).toBe(false);
  });
  it("requires the exact held step names", () => {
    expect(
      planHoldRelease(held, { mode: "rerun", ...base, acknowledge: ["bondTurn"] }, now, clean).ok
    ).toBe(false);
    expect(
      planHoldRelease(held, { mode: "rerun", ...base, acknowledge: [...ack, "x"] }, now, clean).ok
    ).toBe(false);
  });
  it("refuses both modes without a previewToken", () => {
    for (const mode of ["rerun", "mark-done"] as const) {
      const plan = planHoldRelease(held, { mode, acknowledge: ack }, now, clean);
      expect(plan.ok).toBe(false);
      expect(!plan.ok && plan.error).toMatch(/previewToken is required/);
    }
  });
  it("refuses a stale previewToken in both modes", () => {
    for (const mode of ["rerun", "mark-done"] as const) {
      const plan = planHoldRelease(
        held,
        { mode, ...base, previewToken: "old-token-1" },
        now,
        clean
      );
      expect(!plan.ok && plan.error).toMatch(/stale/);
    }
  });
  it("refuses rerun when a step already wrote, unless repair is confirmed", () => {
    const wrote = previewOf(found(7), found(0));
    const plan = planHoldRelease(held, { mode: "rerun", ...base }, now, wrote);
    expect(!plan.ok && plan.error).toMatch(/bondTurn/);
    expect(
      planHoldRelease(held, { mode: "rerun", ...base, confirmRepaired: true }, now, wrote).ok
    ).toBe(true);
  });
  it("refuses rerun when a step left no trace to check, unless repair is confirmed", () => {
    const blind = previewOf(unknownProbe, found(0));
    expect(planHoldRelease(held, { mode: "rerun", ...base }, now, blind).ok).toBe(false);
    expect(
      planHoldRelease(held, { mode: "rerun", ...base, confirmRepaired: true }, now, blind).ok
    ).toBe(true);
  });
});

describe("planHoldRelease happy path", () => {
  it("rerun of steps that wrote nothing clears them and the hold", () => {
    const plan = planHoldRelease(held, { mode: "rerun", ...base }, now, clean);
    expect(plan.ok && Object.keys(plan.unset).sort()).toEqual([
      "processingPhaseResults.bondTurn",
      "processingPhaseResults.treasuryTurn",
      "processingPhaseStatuses.bondTurn",
      "processingPhaseStatuses.treasuryTurn",
    ]);
    expect(plan.ok && plan.set.processingHoldReason).toBeNull();
  });
  it("mark-done with a current token records the steps as done by an operator", () => {
    const plan = planHoldRelease(
      held,
      { mode: "mark-done", ...base },
      now,
      previewOf(found(5), found(2))
    );
    expect(
      plan.ok && (plan.set["processingPhaseStatuses.bondTurn"] as { status: string }).status
    ).toBe("completed");
    expect(plan.ok && Object.keys(plan.unset)).toEqual([]);
  });
});
