import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { THEME_OPTIONS } from "@/lib/themes/themeOptions";

/**
 * Every theme redefines the whole palette, so a colour that reads on the
 * default theme can fail on another. This resolves each theme's tokens the way
 * the browser does (`:root`, then every `[data-theme]` block that applies, in
 * source order) and checks the text/surface pairs the interface relies on
 * against WCAG AA for body text (4.5:1).
 */

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "globals.css"), "utf8");
const AA_BODY = 4.5;

const SURFACES = ["background", "card", "card-elevated", "card-muted"] as const;
const TEXT_TOKENS = ["foreground", "muted", "primary-ink"] as const;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Tokens declared at the top level of a theme selector, in cascade order. */
function resolveTheme(theme: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const source = stripComments(css);
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(",").map((selector) => selector.trim());
    const applies = selectors.some(
      (selector) =>
        selector === ":root" ||
        selector === "[data-theme]" ||
        selector === `[data-theme="${theme}"]`
    );
    if (!applies) continue;
    for (const declaration of match[2].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      tokens[declaration[1]] = declaration[2].trim();
    }
  }
  return tokens;
}

function resolveColour(tokens: Record<string, string>, name: string, depth = 0): string {
  const value = tokens[name];
  if (!value) throw new Error(`token --${name} is not defined`);
  const reference = /^var\(--([a-z0-9-]+)\)$/i.exec(value);
  if (reference && depth < 5) return resolveColour(tokens, reference[1], depth + 1);
  return value;
}

function hexToRgb(value: string): [number, number, number] {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (!match) throw new Error(`expected a hex colour, got ${value}`);
  const hex =
    match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join("") : match[1];
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function luminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(hexToRgb(a)), luminance(hexToRgb(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const themes = THEME_OPTIONS.map((option) => option.value);

describe("theme text contrast", () => {
  it("covers all twelve user themes", () => {
    expect(themes).toHaveLength(12);
    for (const theme of themes) {
      expect(css, `missing [data-theme="${theme}"] block`).toContain(`[data-theme="${theme}"]`);
    }
  });

  it("maps text-primary to the text-only primary shade", () => {
    expect(css).toMatch(/--text-color-primary:\s*var\(--primary-ink\);/);
  });

  it("maps primary text, fill text and borders to their own tokens", () => {
    expect(css).toMatch(/--color-primary-foreground:\s*var\(--primary-foreground\);/);
    expect(css).toMatch(/--border-color-primary:\s*var\(--primary-border\);/);
  });

  it("uses the indigo palette on the default theme", () => {
    const tokens = resolveTheme("default");
    expect(resolveColour(tokens, "primary").toLowerCase()).toBe("#4f46e5");
    expect(resolveColour(tokens, "primary-foreground").toLowerCase()).toBe("#ffffff");
    expect(resolveColour(tokens, "primary-border").toLowerCase()).toBe("#818cf8");
    expect(resolveColour(tokens, "primary-ink").toLowerCase()).toBe("#a5b4fc");
    // Primary fill with white text, and outline text on the card.
    expect(contrast("#ffffff", "#4f46e5")).toBeGreaterThanOrEqual(6.2);
    expect(contrast("#a5b4fc", resolveColour(tokens, "card"))).toBeGreaterThanOrEqual(8.3);
    // Disabled controls sit on the neutral surface with muted text.
    expect(resolveColour(tokens, "card-border").toLowerCase()).toBe("#2a2a3d");
  });

  for (const theme of themes) {
    const tokens = resolveTheme(theme);
    it(`${theme}: text on a primary fill is at least ${AA_BODY}:1`, () => {
      const ratio = contrast(
        resolveColour(tokens, "primary-foreground"),
        resolveColour(tokens, "primary")
      );
      expect(ratio).toBeGreaterThanOrEqual(AA_BODY);
    });
    for (const surface of SURFACES) {
      it(`${theme}: primary border on ${surface} is at least 3:1`, () => {
        const ratio = contrast(
          resolveColour(tokens, "primary-border"),
          resolveColour(tokens, surface)
        );
        expect(ratio).toBeGreaterThanOrEqual(3);
      });
    }
    for (const text of TEXT_TOKENS) {
      for (const surface of SURFACES) {
        it(`${theme}: ${text} on ${surface} is at least ${AA_BODY}:1`, () => {
          const ratio = contrast(resolveColour(tokens, text), resolveColour(tokens, surface));
          expect(ratio).toBeGreaterThanOrEqual(AA_BODY);
        });
      }
    }
  }
});
