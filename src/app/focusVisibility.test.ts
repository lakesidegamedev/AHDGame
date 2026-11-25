import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * globals.css gives every focusable element a themed focus outline. A class
 * list that removes the outline (focus:outline-none or
 * focus-visible:outline-none) must draw its own indicator in the same class
 * list, or keyboard users lose track of where they are.
 */

const SRC = join(process.cwd(), "src");
const REMOVES_OUTLINE = /\b(?:focus|focus-visible):outline-none\b/;
const DRAWS_INDICATOR =
  /\b(?:focus|focus-visible|group-focus|group-focus-visible|peer-focus|peer-focus-visible):(?:ring|border|outline-(?!none)|shadow|underline|bg)/;

/**
 * Fields whose wrapper draws the indicator (focus-within or a focused state),
 * so the field itself can drop its outline. Path relative to src, then a
 * snippet unique to the field's class list.
 */
const WRAPPER_DRAWS_INDICATOR: Array<[string, string]> = [
  ["components/askDrawer/AskDrawerPanel.tsx", "min-h-[44px] flex-1 resize-none"],
  ["components/bills/BillDiscussionPanel.tsx", "block w-full resize-none rounded-lg"],
];

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return name.endsWith(".tsx") && !name.endsWith(".test.tsx") ? [path] : [];
  });
}

function classLists(source: string): string[] {
  return [...source.matchAll(/className=\{?\s*(["'`])([\s\S]*?)\1/g)].map((match) => match[2]);
}

describe("focus visibility", () => {
  it("defines a themed focus outline for every focusable element", () => {
    const css = readFileSync(join(SRC, "app/globals.css"), "utf8");
    expect(css).toMatch(
      /:focus-visible\s*\{\s*outline:\s*2px solid var\(--primary-ink\);\s*outline-offset:\s*2px;/
    );
    expect(css).toMatch(/--ring-color-primary:\s*var\(--primary-ink\);/);
    expect(css).toMatch(/--outline-color-primary:\s*var\(--primary-ink\);/);
  });

  it("never removes the outline without drawing another indicator", () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const path = relative(SRC, file);
      for (const classes of classLists(readFileSync(file, "utf8"))) {
        if (!REMOVES_OUTLINE.test(classes) || DRAWS_INDICATOR.test(classes)) continue;
        const excused = WRAPPER_DRAWS_INDICATOR.some(
          ([excusedPath, snippet]) => excusedPath === path && classes.includes(snippet)
        );
        if (!excused) offenders.push(`${path}: ${classes.slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
