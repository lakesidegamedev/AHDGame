import { describe, expect, it } from "vitest";
import { diffLines, diffStats } from "./lineDiff";

describe("diffLines", () => {
  it("marks added, removed and unchanged lines", () => {
    const lines = diffLines("a\nb\nc", "a\nc\nd");
    expect(lines).toEqual([
      { op: "same", text: "a" },
      { op: "remove", text: "b" },
      { op: "same", text: "c" },
      { op: "add", text: "d" },
    ]);
    expect(diffStats(lines)).toEqual({ added: 1, removed: 1 });
  });

  it("handles empty sides", () => {
    expect(diffLines("", "x")).toEqual([{ op: "add", text: "x" }]);
    expect(diffLines("x", "")).toEqual([{ op: "remove", text: "x" }]);
  });
});
