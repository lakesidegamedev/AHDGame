import { describe, expect, it } from "vitest";
import {
  countDoubleCasts,
  findRegressions,
  isScannedFile,
  lowerBaseline,
  readBaseline,
  scanRepo,
} from "./doubleCastRatchet";

describe("double cast counter", () => {
  it("counts double casts through unknown", () => {
    const source = "const a = x as unknown as Foo;\nconst b = (y as unknown as Bar[]).length;";
    expect(countDoubleCasts(source, "src/lib/x.ts")).toBe(2);
  });
  it("ignores single casts, comments and strings", () => {
    const source = [
      "const a = x as Foo;",
      "const b = y as unknown;",
      "// z as unknown as Foo",
      'const c = "w as unknown as Foo";',
    ].join("\n");
    expect(countDoubleCasts(source, "src/lib/x.ts")).toBe(0);
  });
  it("skips tests and fixtures", () => {
    expect(isScannedFile("src/lib/a.test.ts")).toBe(false);
    expect(isScannedFile("src/lib/__fixtures__/a.ts")).toBe(false);
    expect(isScannedFile("src/lib/turnSystem.ts")).toBe(true);
  });
});

describe("double cast ratchet", () => {
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

describe("repository double casts", () => {
  it("does not exceed the committed baseline", () => {
    const regressions = findRegressions(readBaseline().files, scanRepo());
    expect(
      regressions,
      regressions.map((r) => `${r.file}: ${r.baseline} -> ${r.current}`).join("\n") +
        "\nReplace `as unknown as` with a typed getter, a generic find<T>, or a type guard. Only removals may lower the baseline: npm run double-casts:lower"
    ).toEqual([]);
  }, 90_000);
});
