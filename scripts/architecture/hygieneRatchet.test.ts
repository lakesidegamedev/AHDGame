import { describe, expect, it } from "vitest";
import {
  countFile,
  emptyCounts,
  findRegressions,
  isScannedFile,
  lowerBaseline,
  readBaseline,
  scanRepo,
} from "./hygieneRatchet";

describe("hygiene counters", () => {
  it("counts console calls but not strings or comments", () => {
    const source = [
      "console.log(1);",
      "console.error('x');",
      "// console.warn('no')",
      'const s = "console.log(1)";',
    ].join("\n");
    expect(countFile(source, "src/a.ts").console).toBe(2);
  });
  it("counts only catch blocks with no body and no comment", () => {
    const source = [
      "try { a(); } catch {}",
      "try { a(); } catch (e) { }",
      "try { a(); } catch { /* best effort */ }",
      "try { a(); } catch { // best effort\n }",
      "try { a(); } catch (e) { log(e); }",
    ].join("\n");
    expect(countFile(source, "src/a.ts").emptyCatch).toBe(2);
  });
  it("counts eslint-disable comments only", () => {
    const source = [
      "// eslint-disable-next-line no-console",
      "/* eslint-disable */",
      "// eslint-enable",
      'const s = "eslint-disable";',
    ].join("\n");
    expect(countFile(source, "src/a.ts").eslintDisable).toBe(2);
  });
  it("counts explicit any keywords", () => {
    const source = "const a: any = 1; function f(x: any[]): Array<any> { return x as any; }";
    expect(countFile(source, "src/a.ts").explicitAny).toBe(4);
  });
  it("flags files that only re-export", () => {
    expect(countFile('export * from "./x";\nexport { a } from "./y";', "src/a.ts").forwarder).toBe(
      1
    );
    expect(countFile('import { a } from "./y";\nexport { a };', "src/a.ts").forwarder).toBe(0);
    expect(countFile("export const a = 1;", "src/a.ts").forwarder).toBe(0);
  });
  it("skips tests and fixtures", () => {
    expect(isScannedFile("src/lib/a.test.ts")).toBe(false);
    expect(isScannedFile("src/lib/__fixtures__/a.ts")).toBe(false);
    expect(isScannedFile("src/lib/turnSystem.ts")).toBe(true);
  });
});

describe("hygiene ratchet", () => {
  const baseline = { ...emptyCounts(), console: { "a.ts": 2 } };
  it("passes when counts are equal or lower", () => {
    expect(findRegressions(baseline, { ...emptyCounts(), console: { "a.ts": 1 } })).toEqual([]);
  });
  it("fails a higher count or a new file, per metric", () => {
    const current = { ...emptyCounts(), console: { "a.ts": 3 }, emptyCatch: { "b.ts": 1 } };
    expect(findRegressions(baseline, current)).toEqual([
      { metric: "console", file: "a.ts", baseline: 2, current: 3 },
      { metric: "emptyCatch", file: "b.ts", baseline: 0, current: 1 },
    ]);
  });
  it("lowers counts, drops cleaned files, never raises or adds", () => {
    const base = { ...emptyCounts(), console: { "a.ts": 2, "c.ts": 1 } };
    const current = { ...emptyCounts(), console: { "a.ts": 5, "new.ts": 9 } };
    expect(lowerBaseline(base, current).console).toEqual({ "a.ts": 2 });
  });
});

describe("repository hygiene", () => {
  it("does not exceed the committed baseline", () => {
    const regressions = findRegressions(readBaseline().metrics, scanRepo());
    expect(
      regressions,
      regressions.map((r) => `${r.metric} ${r.file}: ${r.baseline} -> ${r.current}`).join("\n") +
        "\nOnly removals may lower the baseline: npm run hygiene:lower"
    ).toEqual([]);
  }, 90_000);
});
