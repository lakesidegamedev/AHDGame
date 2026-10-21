import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The corporation page follows the player's site theme, so its components may
 * only colour through theme tokens. Files edited by the redesign outside this
 * folder are listed here as each task touches them.
 */
export const LEDGER_FILES: string[] = [];

const LEDGER_DIR = join(process.cwd(), "src/components/corporation/ledger");
const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function sourceFiles(): string[] {
  const own = readdirSync(LEDGER_DIR)
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
    .map((f) => join(LEDGER_DIR, f));
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
