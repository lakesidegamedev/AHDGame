import { describe, expect, it } from "vitest";
import {
  countComments,
  extractCommentBlocks,
  findRegressions,
  lowerBaseline,
  readBaseline,
  scanRepo,
} from "./commentRatchet";

const longBlock = (n: number) =>
  Array.from({ length: n }, (_, i) => `// line ${i}`).join("\n") + "\nconst x = 1;";

describe("comment counter", () => {
  it("groups consecutive line comments into one block", () => {
    const blocks = extractCommentBlocks("// a\n// b\nconst x = 1;\n// c\n");
    expect(blocks.map((b) => b.lines.length)).toEqual([2, 1]);
  });
  it("counts only blocks over 12 lines as long", () => {
    expect(countComments(longBlock(12)).longBlocks).toBe(0);
    expect(countComments(longBlock(13)).longBlocks).toBe(1);
  });
  it("counts block comments by their lines", () => {
    const body = Array.from({ length: 14 }, (_, i) => ` * line ${i}`).join("\n");
    expect(countComments(`/**\n${body}\n */\nexport {};`).longBlocks).toBe(1);
  });
  it.each([
    "// fixed on 2026-10-30",
    "// see #5687 for context",
    "// per the support ticket",
    "// previously this clamped",
    "// it used to return null",
    "// owner decided to cap this",
  ])("flags narrative comment: %s", (line) => {
    expect(countComments(line).narrativeLines).toBe(1);
  });
  it("ignores neutral comments and comment markers inside strings", () => {
    const src = [
      "// clamp to the cap so the pool cannot go negative",
      'const url = "http://example.com/2026-10-30 ticket";',
      "const color = `#123456 // previously`;",
      "const hex = 0xff; // &#8212; entity",
    ].join("\n");
    expect(countComments(src)).toEqual({ longBlocks: 0, narrativeLines: 0 });
  });
});

describe("ratchet", () => {
  const baseline = { "a.ts": { longBlocks: 2, narrativeLines: 3 } };
  it("passes when counts are equal or lower", () => {
    expect(findRegressions(baseline, { "a.ts": { longBlocks: 2, narrativeLines: 1 } })).toEqual([]);
  });
  it("fails when a count goes up", () => {
    expect(findRegressions(baseline, { "a.ts": { longBlocks: 3, narrativeLines: 3 } })).toEqual([
      { file: "a.ts", metric: "longBlocks", baseline: 2, current: 3 },
    ]);
  });
  it("fails when a new file adds any", () => {
    expect(
      findRegressions(baseline, { "b.ts": { longBlocks: 0, narrativeLines: 1 } })
    ).toHaveLength(1);
  });
  it("lowers counts, drops cleaned files, never raises or adds", () => {
    const lowered = lowerBaseline(
      { ...baseline, "c.ts": { longBlocks: 1, narrativeLines: 0 } },
      {
        "a.ts": { longBlocks: 5, narrativeLines: 1 },
        "new.ts": { longBlocks: 9, narrativeLines: 9 },
      }
    );
    expect(lowered).toEqual({ "a.ts": { longBlocks: 2, narrativeLines: 1 } });
  });
});

describe("repository comments", () => {
  it("do not exceed the committed baseline", () => {
    const regressions = findRegressions(readBaseline().files, scanRepo());
    expect(
      regressions,
      "Comments gained narrative or overlong blocks. Explain why, not history; no dates, ticket numbers or change narration. Shorten them. Only cleanups may lower the baseline: npm run comment:ratchet:lower"
    ).toEqual([]);
  });
});
