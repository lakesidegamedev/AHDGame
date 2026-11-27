import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import {
  applyExecutivePoliticalImpact,
  computeExecutivePoliticalImpact,
} from "../executivePoliticalImpact";

describe("computeExecutivePoliticalImpact", () => {
  it("repudiate has the largest hit", () => {
    const r = computeExecutivePoliticalImpact("repudiate");
    expect(r.favorabilityDelta).toBe(-20);
    expect(r.infamyDelta).toBe(15);
  });

  it("monetize is second-worst", () => {
    const r = computeExecutivePoliticalImpact("monetize");
    expect(r.favorabilityDelta).toBe(-15);
    expect(r.infamyDelta).toBe(10);
  });

  it("bailout is moderately punishing (austerity backlash)", () => {
    const r = computeExecutivePoliticalImpact("bailout");
    expect(r.favorabilityDelta).toBe(-10);
    expect(r.infamyDelta).toBe(5);
  });

  it("restructure is the least-bad path", () => {
    const r = computeExecutivePoliticalImpact("restructure");
    expect(r.favorabilityDelta).toBe(-8);
    expect(r.infamyDelta).toBe(5);
  });

  it("repudiate hits favorability harder than restructure", () => {
    const rep = computeExecutivePoliticalImpact("repudiate");
    const res = computeExecutivePoliticalImpact("restructure");
    expect(Math.abs(rep.favorabilityDelta)).toBeGreaterThan(Math.abs(res.favorabilityDelta));
  });
});

describe("applyExecutivePoliticalImpact", () => {
  it("no-op when characterId is null", async () => {
    const updateOne = vi.fn();
    const db = { collection: vi.fn(() => ({ updateOne })) } as never;
    const r = await applyExecutivePoliticalImpact(db, null, "repudiate");
    expect(r.applied).toBe(false);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("no-op when characterId is undefined", async () => {
    const updateOne = vi.fn();
    const db = { collection: vi.fn(() => ({ updateOne })) } as never;
    const r = await applyExecutivePoliticalImpact(db, undefined, "repudiate");
    expect(r.applied).toBe(false);
  });

  it("applies the path's deltas without leaving percentage bounds", async () => {
    const f = createTransactionalMemoryDb();
    const charId = new ObjectId();
    f.memory.seed("characters", [{ _id: charId, favorability: 5, infamy: 95 }]);
    expect((await applyExecutivePoliticalImpact(f.db, charId, "repudiate")).applied).toBe(true);
    expect(f.memory.collection("characters").docs[0]).toMatchObject({
      favorability: 0,
      infamy: 100,
    });
  });
});
