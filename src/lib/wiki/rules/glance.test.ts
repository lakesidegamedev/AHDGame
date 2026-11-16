import { describe, expect, it } from "vitest";
import { extractWikiGlance } from "@/lib/wiki/rules/glance";

describe("extractWikiGlance", () => {
  it("takes the first two column table", () => {
    const md = [
      "Intro",
      "",
      "| Setting | Value |",
      "| --- | --- |",
      "| Lower chamber | **218** of 435 |",
      "| Window | [24 turns](/wiki/turns) |",
      "",
      "| A | B | C |",
      "| - | - | - |",
      "| 1 | 2 | 3 |",
    ].join("\n");
    expect(extractWikiGlance(md)).toEqual([
      { label: "Lower chamber", value: "218 of 435" },
      { label: "Window", value: "24 turns" },
    ]);
  });

  it("skips wide tables and returns null when nothing fits", () => {
    const md = "| A | B | C |\n| - | - | - |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |";
    expect(extractWikiGlance(md)).toBeNull();
  });

  it("reads an infobox tag", () => {
    const md = "{{infobox:party|Leader=Ada Lane|Founded=2026}}\n\nText";
    expect(extractWikiGlance(md)).toEqual([
      { label: "Leader", value: "Ada Lane" },
      { label: "Founded", value: "2026" },
    ]);
  });

  it("ignores tables inside code fences and long values", () => {
    const md = [
      "```",
      "| a | b |",
      "| - | - |",
      "| x | y |",
      "| z | w |",
      "```",
      "| K | V |",
      "| - | - |",
      `| Long | ${"word ".repeat(30)} |`,
      "| One | 1 |",
    ].join("\n");
    expect(extractWikiGlance(md)).toBeNull();
  });
});
