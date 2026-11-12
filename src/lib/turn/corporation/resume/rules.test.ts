import { describe, expect, it } from "vitest";
import {
  chunkPlan,
  corporationTurnResumeVerdict,
  remainingChunks,
  resilienceStageOf,
  chunkBySize,
  decodeOutput,
  encodeOutput,
  isStorableOutput,
  stampOp,
  stampPlan,
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
      "corpTurnApplied.corporationCash.0": { $ne: 42 },
    });
    expect(op.updateOne.update).toEqual({
      $inc: { cash: 5 },
      $set: { x: 1, "corpTurnApplied.corporationCash.0": 42 },
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

  it("numbers ops per document and flags unstampable ops", () => {
    const mk = (id: string) => ({ updateOne: { filter: { _id: id }, update: { $inc: { a: 1 } } } });
    const plan = stampPlan(
      [mk("a"), mk("a"), mk("b"), { insertOne: { document: {} } }],
      "sectorWrites",
      3
    );
    expect(plan.unstamped).toBe(1);
    const slots = plan.ops
      .slice(0, 3)
      .map((op) => Object.keys((op as ReturnType<typeof mk>).updateOne.filter)[1]);
    expect(slots).toEqual([
      "corpTurnApplied.sectorWrites.0",
      "corpTurnApplied.sectorWrites.1",
      "corpTurnApplied.sectorWrites.0",
    ]);
  });

  it("chunks by count and bytes", () => {
    expect(chunkBySize([1, 1, 1, 1, 1], () => 1, 2, 100)).toEqual([[1, 1], [1, 1], [1]]);
    expect(chunkBySize([5, 5, 5], (n) => n, 10, 10)).toEqual([[5, 5], [5]]);
  });

  it("round trips Maps and Sets and rejects class instances", () => {
    const value = {
      a: new Map([["x", new Map([["y", 2]])]]),
      b: new Set([1, 2]),
      c: [new Date(0)],
    };
    expect(isStorableOutput(value)).toBe(true);
    expect(decodeOutput(JSON.parse(JSON.stringify(encodeOutput(value))))).toEqual({
      ...value,
      c: ["1970-01-01T00:00:00.000Z"],
    });
    expect(isStorableOutput({ f: () => 1 })).toBe(false);
    expect(isStorableOutput(new (class X {})())).toBe(false);
  });
});
