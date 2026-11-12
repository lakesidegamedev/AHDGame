import { describe, expect, it } from "vitest";
import {
  chunkPlan,
  corporationTurnResumeVerdict,
  remainingChunks,
  resilienceStageOf,
  stampOp,
  stepStatus,
} from "./rules";

describe("corporation turn resume rules", () => {
  it("treats a missing or bad stage as 0", () => {
    expect(resilienceStageOf(undefined)).toBe(0);
    expect(resilienceStageOf({ turnResilienceStage: Number.NaN })).toBe(0);
    expect(resilienceStageOf({ turnResilienceStage: 2 })).toBe(2);
  });

  it("chunks and tracks remaining chunks", () => {
    expect(chunkPlan([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(() => chunkPlan([1], 0)).toThrow();
    const journal = { turn: 9, steps: { corporationCash: { chunks: 3, applied: [0, 2] } } };
    expect(remainingChunks(journal, "corporationCash")).toEqual([1]);
    expect(stepStatus(journal, "corporationCash")).toBe("applying");
    expect(stepStatus(journal, "sectorWrites")).toBeNull();
  });

  it("stamps an op so a replay matches nothing", () => {
    const op = stampOp(
      { updateOne: { filter: { _id: "c1" }, update: { $inc: { cash: 5 }, $set: { x: 1 } } } },
      "corporationCash",
      42
    );
    expect(op.updateOne.filter).toEqual({
      _id: "c1",
      "corpTurnApplied.corporationCash": { $ne: 42 },
    });
    expect(op.updateOne.update).toEqual({
      $inc: { cash: 5 },
      $set: { x: 1, "corpTurnApplied.corporationCash": 42 },
    });
  });

  it("only allows resume at stage 2 with a matching journal and no unjournaled writes", () => {
    const journal = { turn: 7, steps: {} };
    const ok = { stage: 2, journal, turn: 7, unjournaledWritesStarted: false };
    expect(corporationTurnResumeVerdict(ok)).toEqual({ resume: true });
    expect(corporationTurnResumeVerdict({ ...ok, stage: 1 }).resume).toBe(false);
    expect(corporationTurnResumeVerdict({ ...ok, journal: null }).resume).toBe(false);
    expect(corporationTurnResumeVerdict({ ...ok, turn: 8 }).resume).toBe(false);
    expect(corporationTurnResumeVerdict({ ...ok, unjournaledWritesStarted: true }).resume).toBe(
      false
    );
  });
});
