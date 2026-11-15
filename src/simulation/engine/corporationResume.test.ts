import { describe, expect, it, vi } from "vitest";
import { validateLockedResume } from "@/simulation/engine/turnResumeBootstrap";
import { TurnResumeRefusedError } from "@/simulation/engine/turnPhaseResumeResults";
import { corporationTurnRerunSet } from "@/simulation/engine/corporationResume";

vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));

const locked = () =>
  ({
    currentTurn: 11,
    processingTargetTurn: 12,
    processingPhase: "corporationTurn",
    processingPhaseStatuses: { corporationTurn: { status: "running" } },
    processingPhaseResults: null,
  }) as never;

describe("corporationTurn rerun on resume", () => {
  it("refuses an interrupted corporationTurn by default", () => {
    expect(() => validateLockedResume(locked(), 12)).toThrow(TurnResumeRefusedError);
  });

  it("reruns it, neither refusing nor carrying it as applied, when the caller proves it safe", () => {
    const resume = validateLockedResume(locked(), 12, new Set(["corporationTurn"]));
    expect(resume).not.toBeNull();
    expect(resume!.appliedPhases.has("corporationTurn")).toBe(false);
    expect(resume!.phaseState.interrupted.has("corporationTurn")).toBe(false);
  });

  it("allows nothing when the turn is not interrupted in corporationTurn", async () => {
    const db = {} as never;
    const set = await corporationTurnRerunSet(db, {
      currentTurn: 11,
      processingTargetTurn: 12,
      processingPhaseStatuses: { corporationTurn: { status: "completed" } },
    });
    expect(set.size).toBe(0);
  });
});
