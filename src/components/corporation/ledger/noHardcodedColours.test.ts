import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The corporation page follows the player's site theme, so its components may
 * only colour through theme tokens. Files edited by the redesign outside this
 * folder are listed here as each task touches them.
 */
export const LEDGER_FILES: string[] = [];

/** Directories written for the redesign; every component in them is checked. */
const LEDGER_DIRS = [
  "ledger",
  "masthead",
  "overview",
  "finance",
  "sectors",
  "deals",
  "structure",
].map((d) => join(process.cwd(), "src/components/corporation", d));
const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function sourceFiles(): string[] {
  const own = LEDGER_DIRS.flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
      .map((f) => join(dir, f))
  );
  return [...own, ...LEDGER_FILES.map((f) => join(process.cwd(), f))];
}

describe("corporation ledger colours", () => {
  it("uses theme tokens only, no colour literals", () => {
    const offenders = sourceFiles().filter((file) =>
      COLOUR_LITERAL.test(stripComments(readFileSync(file, "utf8")))
    );
    expect(offenders).toEqual([]);
  });
});

/**
 * White text on a tone fill fails contrast in the light themes, where the tone
 * colours are bright; the redesign uses the theme background colour instead.
 */
const WHITE_ON_TONE = /\bbg-(error|success|warning|info|primary|gold)\b[^"`]*\btext-white\b/;

describe("corporation tone fills", () => {
  it("never put white text on a tone colour", () => {
    const files = [
      ...sourceFiles(),
      join(process.cwd(), "src/app/corporation/[id]/page.tsx"),
      join(process.cwd(), "src/components/corporation/SubsidiaryManagementCard.tsx"),
      join(process.cwd(), "src/components/corporation/SectorRow.tsx"),
    ];
    const offenders = files.filter((file) => WHITE_ON_TONE.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
