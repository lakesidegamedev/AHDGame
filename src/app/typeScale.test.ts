import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * One type scale: display 30, heading 20, body-lg 16 (also every h3), body 14,
 * body-sm 12. Stock Tailwind sizes, arbitrary text-[..] sizes and off-scale
 * inline sizes fail here. SVG text is sized in chart units and is exempt.
 */

const SRC = join(process.cwd(), "src");
const SCALE_PX = new Set([12, 14, 16, 20, 30]);
const STOCK =
  /(?<![\w\-[/.])(?:[\w\-[\]&:>*@()]+:)*!?text-(xs|sm|base|lg|xl|[2-9]xl)(?=[\s"'`}),/]|$)/;
const ARBITRARY = /(?<![\w\-[/.])(?:[\w\-[\]&:>*@()]+:)*!?text-\[(?:\d|length:)/;
const OFF_TOKENS =
  /\btext-(body-xs|heading-sm|heading-lg)\b|--text-(body-xs|heading-sm|heading-lg)\b/;

function files(dir: string, test: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, test);
    return test(name) ? [path] : [];
  });
}

const sources = files(
  SRC,
  (name) => /\.(tsx|ts)$/.test(name) && !name.includes(".test.") && !name.endsWith(".generated.ts")
);

function scan(pattern: RegExp, skip?: (source: string) => boolean): string[] {
  const offenders: string[] = [];
  for (const file of sources) {
    const source = readFileSync(file, "utf8");
    if (skip?.(source)) continue;
    source.split("\n").forEach((line, index) => {
      const hit = pattern.exec(line);
      if (hit) offenders.push(`${relative(SRC, file)}:${index + 1} ${hit[0].trim()}`);
    });
  }
  return offenders;
}

describe("type scale", () => {
  it("defines exactly the five steps", () => {
    const css = readFileSync(join(SRC, "app/globals.css"), "utf8");
    const steps = [...css.matchAll(/^\s*--text-([a-z-]+):\s/gm)]
      .map((match) => match[1])
      .filter((name) => !name.startsWith("color-") && !name.endsWith("-line-height"));
    expect(steps.sort()).toEqual(["body", "body-lg", "body-sm", "display", "heading"]);
    expect(css).toMatch(/h3\s*\{\s*font-size:\s*var\(--text-body-lg\);/);
  });

  it("uses no stock Tailwind sizes", () => {
    expect(scan(STOCK)).toEqual([]);
  });

  it("uses no arbitrary text sizes", () => {
    expect(scan(ARBITRARY)).toEqual([]);
  });

  it("uses no off-scale size tokens", () => {
    expect(scan(OFF_TOKENS)).toEqual([]);
  });

  it("keeps inline HTML font sizes on the scale", () => {
    const offenders = scan(/fontSize:\s*(\d+(?:\.\d+)?)(?![\d.])/, (source) =>
      /<(text|tspan|svg)\b/.test(source)
    ).filter((hit) => !SCALE_PX.has(Number(/fontSize:\s*([\d.]+)/.exec(hit)?.[1])));
    expect(offenders).toEqual([]);
  });

  it("sizes every h3 at 16px", () => {
    const offenders: string[] = [];
    for (const file of sources.filter((path) => path.endsWith(".tsx"))) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/<h3\b[^>]*?className=\{?\s*["'`]([^"'`]*)["'`]/g)) {
        const size = /(?:^|\s)text-(body-sm|body|heading|display)(?=\s|$)/.exec(match[1]);
        if (size) offenders.push(`${relative(SRC, file)}: ${size[0].trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps stylesheet font sizes on the scale", () => {
    const offenders: string[] = [];
    for (const file of files(SRC, (name) => name.endsWith(".css"))) {
      const css = readFileSync(file, "utf8");
      for (const match of css.matchAll(/font-size:\s*([^;]+);/g)) {
        const value = match[1].trim();
        if (/^var\(--text-(body-sm|body|body-lg|heading|display)\)$/.test(value)) continue;
        if (/^(inherit|1em|100%)$/.test(value)) continue;
        // iOS zooms into any focused field under 16px; the mobile input rule is literal.
        if (value === "16px !important") continue;
        offenders.push(`${relative(SRC, file)}: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
