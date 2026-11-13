import { describe, expect, it } from "vitest";
import { planHoldRelease } from "./holdRelease";

const now = new Date("2027-01-01T00:00:00Z");
const held = { processingHoldReason: "held", processingHeldPhases: ["bondTurn", "treasuryTurn"] };

describe("planHoldRelease", () => {
  it("refuses when nothing is held", () => {
    expect(planHoldRelease({}, { mode: "rerun", acknowledge: [] }, now).ok).toBe(false);
  });
  it("requires the exact held step names", () => {
    expect(planHoldRelease(held, { mode: "rerun", acknowledge: ["bondTurn"] }, now).ok).toBe(false);
    expect(
      planHoldRelease(held, { mode: "rerun", acknowledge: ["bondTurn", "treasuryTurn", "x"] }, now)
        .ok
    ).toBe(false);
  });
  it("rerun clears the held steps and the hold", () => {
    const plan = planHoldRelease(
      held,
      { mode: "rerun", acknowledge: ["treasuryTurn", "bondTurn"] },
      now
    );
    expect(plan.ok && Object.keys(plan.unset).sort()).toEqual([
      "processingPhaseResults.bondTurn",
      "processingPhaseResults.treasuryTurn",
      "processingPhaseStatuses.bondTurn",
      "processingPhaseStatuses.treasuryTurn",
    ]);
    expect(plan.ok && plan.set.processingHoldReason).toBeNull();
  });
  it("mark-done records the steps as completed by the operator", () => {
    const plan = planHoldRelease(
      held,
      { mode: "mark-done", acknowledge: ["bondTurn", "treasuryTurn"] },
      now
    );
    expect(
      plan.ok && (plan.set["processingPhaseStatuses.bondTurn"] as { status: string }).status
    ).toBe("completed");
    expect(plan.ok && Object.keys(plan.unset)).toEqual([]);
  });
});
