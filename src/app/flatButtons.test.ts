import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Buttons are flat: one fill colour, no gradient and no coloured glow. This
 * scans every button-like JSX tag and every stylesheet rule aimed at buttons
 * or links.
 */

const SRC = join(process.cwd(), "src");

const TAG_EFFECTS =
  /linear-gradient|radial-gradient|bg-gradient-to|bg-linear-|\bfrom-[a-z]|shadow-(?:primary|success|error|warning|gold|info|secondary)\b|shadow-\[[^\]]*(?:color-mix|rgba?\((?!0[ ,_]+0[ ,_]+0)|#)|drop-shadow-\[|\bglow\b/;

/** Selection rings drawn with box-shadow on a picker are not a glow. */
const ALLOWED_TAGS: Array<[string, string]> = [
  ["components/admin/alts/RingGraph.tsx", "boxShadow: `0 0 0 2px"],
  ["app/elections/[id]/blend/PrimaryTileBoard.tsx", "boxShadow"],
  ["app/settings/components/AppearanceSection.tsx", "shadow-[0_0_0_2px"],
];

function files(dir: string, extension: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, extension);
    return name.endsWith(extension) && !name.includes(".test.") ? [path] : [];
  });
}

/** Index just past the `>` that closes a JSX opening tag starting at `start`. */
function tagEnd(source: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === quote && source[i - 1] !== "\\") quote = null;
    } else if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === ">" && depth === 0) return i;
  }
  return source.length;
}

/** A glow is a centred, blurred box-shadow: zero offsets and a blur above zero. */
function hasHalo(body: string): boolean {
  const shadow = /box-shadow:\s*([^;]+);/.exec(body)?.[1];
  if (!shadow) return false;
  return shadow.split(/,(?![^(]*\))/).some((layer) => {
    const lengths = layer.match(/-?\d*\.?\d+(?:px|rem|em)?(?=\s|$)/g) ?? [];
    const [x, y, blur] = lengths.map((length) => parseFloat(length));
    return x === 0 && y === 0 && (blur ?? 0) > 0;
  });
}

describe("flat buttons", () => {
  it("gives no button-like element a gradient or a coloured glow", () => {
    const offenders: string[] = [];
    for (const file of files(SRC, ".tsx")) {
      const path = relative(SRC, file);
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/<(button|Button|SmallButton|Link|a)\b/g)) {
        const tag = source.slice(match.index, tagEnd(source, match.index + match[0].length));
        const effect = TAG_EFFECTS.exec(tag);
        if (!effect) continue;
        if (ALLOWED_TAGS.some(([allowed, snippet]) => allowed === path && tag.includes(snippet)))
          continue;
        offenders.push(`${path}: <${match[1]}> ${effect[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("gives no stylesheet rule for buttons or links a gradient or a glow", () => {
    const offenders: string[] = [];
    for (const file of files(SRC, ".css")) {
      const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const rule of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = rule[1].trim();
        const body = rule[2];
        const targetsButtons = /(^|[\s,(:])(button|a)\b(?![-\w])|\.btn|\.bg-primary/.test(
          selector.replace(/:not\([^)]*\)/g, "")
        );
        if (!targetsButtons) continue;
        if (/gradient|text-shadow|glow/.test(body) || hasHalo(body))
          offenders.push(`${relative(SRC, file)}: ${selector.replace(/\s+/g, " ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
