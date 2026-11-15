import { describe, expect, it } from "vitest";
import {
  countCountryBranches,
  findRegressions,
  isScanned,
  lowerBaseline,
  readBaseline,
  scanRepo,
} from "./countryBranchRatchet";

describe("countCountryBranches", () => {
  it("counts equality checks and case labels against country codes", () => {
    const source = [
      'if (countryId === "US") {}',
      "if (code !== 'UK') {}",
      'if ("DE" === countryId) {}',
      'switch (c) { case "JP": break; case "CN": break; }',
    ].join("\n");
    expect(countCountryBranches(source)).toBe(5);
  });

  it("ignores strings that are not country comparisons", () => {
    const source = [
      'const label = "US";',
      'if (kind === "senate") {}',
      'if (["US", "UK"].includes(id)) {}',
      'if (x === "ZZZ") {}',
    ].join("\n");
    expect(countCountryBranches(source)).toBe(0);
  });
});

describe("scan scope", () => {
  it("skips country folders and tests", () => {
    expect(isScanned("src/lib/countries/ie/elections.ts")).toBe(false);
    expect(isScanned("src/lib/foo.test.ts")).toBe(false);
    expect(isScanned("src/lib/foo.ts")).toBe(true);
    expect(isScanned("src/components/Foo.tsx")).toBe(true);
  });
});

describe("ratchet arithmetic", () => {
  it("flags a rise and a new file, not a fall", () => {
    expect(findRegressions({ a: 2, b: 1 }, { a: 3, b: 1, c: 1 })).toEqual([
      { file: "a", baseline: 2, current: 3 },
      { file: "c", baseline: 0, current: 1 },
    ]);
    expect(findRegressions({ a: 2 }, { a: 1 })).toEqual([]);
  });

  it("lowers counts and never raises them or adds files", () => {
    expect(lowerBaseline({ a: 2, b: 1 }, { a: 1, b: 4, c: 9 })).toEqual({ a: 1, b: 1 });
    expect(lowerBaseline({ a: 2 }, {})).toEqual({});
  });
});

describe("country branches outside src/lib/countries", () => {
  it("never exceed the recorded baseline", () => {
    const regressions = findRegressions(readBaseline().files, scanRepo());
    expect(
      regressions,
      regressions.map((r) => `${r.file}: ${r.baseline} -> ${r.current}`).join("\n") +
        "\nPut the country rule in src/lib/countries/<cc>/ instead of branching on the code."
    ).toEqual([]);
  }, 60_000);
});
