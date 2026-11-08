import { describe, expect, it } from "vitest";
import {
  countFunctionDeclarations,
  findRegressions,
  isScannedFile,
  lowerBaseline,
  readBaseline,
  scanRepo,
} from "./constantsFunctionRatchet";

describe("constants function counter", () => {
  it("counts function declarations, not arrows or re-exports", () => {
    const source = [
      "export function a() {}",
      "function b() { function c() {} }",
      "export const d = () => 1;",
      'export { e } from "./rules";',
    ].join("\n");
    expect(countFunctionDeclarations(source, "src/lib/constants/x.ts")).toBe(3);
  });
  it("scans only non-test files under constants", () => {
    expect(isScannedFile("src/lib/constants/a.ts")).toBe(true);
    expect(isScannedFile("src/lib/constants/techTree/a.ts")).toBe(true);
    expect(isScannedFile("src/lib/constants/a.test.ts")).toBe(false);
    expect(isScannedFile("src/lib/constants/__tests__/a.ts")).toBe(false);
    expect(isScannedFile("src/lib/other/a.ts")).toBe(false);
  });
});

describe("constants function ratchet", () => {
  const baseline = { "a.ts": 2 };
  it("passes when counts are equal or lower", () => {
    expect(findRegressions(baseline, { "a.ts": 1 })).toEqual([]);
  });
  it("fails a higher count or a new file", () => {
    expect(findRegressions(baseline, { "a.ts": 3, "b.ts": 1 })).toEqual([
      { file: "a.ts", baseline: 2, current: 3 },
      { file: "b.ts", baseline: 0, current: 1 },
    ]);
  });
  it("lowers counts, drops cleaned files, never raises or adds", () => {
    expect(lowerBaseline({ ...baseline, "c.ts": 1 }, { "a.ts": 5, "new.ts": 9 })).toEqual({
      "a.ts": 2,
    });
  });
});

describe("repository constants functions", () => {
  it("does not exceed the committed baseline", () => {
    const regressions = findRegressions(readBaseline().files, scanRepo());
    expect(
      regressions,
      regressions.map((r) => `${r.file}: ${r.baseline} -> ${r.current}`).join("\n") +
        "\nPut the function in a rules module beside its system and forward it from constants. Only removals may lower the baseline: npm run constants-functions:lower"
    ).toEqual([]);
  }, 90_000);
});
