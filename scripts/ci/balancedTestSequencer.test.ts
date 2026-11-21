import { describe, expect, it } from "vitest";
import { balanceTestFiles } from "./balancedTestSequencer";

describe("duration-balanced CI shards", () => {
  const files = ["a", "b", "c", "d", "new"];
  const known = new Map([
    ["a", 8],
    ["b", 5],
    ["c", 3],
    ["d", 2],
  ]);
  const shards = (input: string[]) =>
    balanceTestFiles(
      input,
      2,
      (file) => file,
      (file) => known.get(file) ?? 1
    );

  it("balances long tests and includes each discovered test, including new tests", () => {
    expect(shards(files)).toEqual([
      ["a", "d"],
      ["b", "c", "new"],
    ]);
    expect(shards(files).flat().sort()).toEqual(files);
  });

  it("uses the same assignment when runner discovery order changes", () => {
    expect(shards([...files].reverse())).toEqual(shards(files));
    expect(
      balanceTestFiles(
        ["b", "a"],
        2,
        (file) => file,
        () => 1
      )
    ).toEqual([["a"], ["b"]]);
  });
});
