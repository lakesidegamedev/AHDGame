import { describe, expect, it } from "vitest";
import { canonical, diffStates, hashDoc, type EndState } from "./end-state";

const state = (docs: Record<string, string>, sums: Record<string, number>): EndState => ({
  db: "ahdspeed_x",
  takenAt: "",
  collections: { corporations: { count: Object.keys(docs).length, sums, docs } },
});

describe("end-state", () => {
  it("ignores key order and volatile fields", () => {
    expect(hashDoc({ a: 1, b: 2, updatedAt: new Date(1) })).toBe(
      hashDoc({ b: 2, a: 1, updatedAt: new Date(2) })
    );
    expect(canonical({ z: new Date(0) })).toEqual({ z: "1970-01-01T00:00:00.000Z" });
  });
  it("reports identical states as empty", () => {
    expect(diffStates(state({ a: "1" }, { cash: 5 }), state({ a: "1" }, { cash: 5 }))).toEqual([]);
  });
  it("flags a double-applied money move as a sum drift and a changed doc", () => {
    const rows = diffStates(state({ a: "1" }, { cash: 5 }), state({ a: "2" }, { cash: 10 }));
    expect(rows.map((r) => r.kind).sort()).toEqual(["docs", "sum"]);
  });
});
