import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import * as corporations from "./corporations";
import * as corporationsClient from "./corporationsClient";
import * as commodities from "./commodities";
import * as commoditiesCore from "./commoditiesCore";

/**
 * Guard for the slim constants modules.
 *
 * A client module that only needs a label or a lane type must import the slim
 * module; importing the full constants file drags its price, margin and
 * dominance tables into every page that renders one label. The two slim modules
 * re-export their contents through the full modules, so a rewrite cannot change
 * values.
 */

const ROOTS = ["src/app", "src/components", "src/hooks", "src/contexts", "src/lib"];

function sourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) && !entry.includes(".test.") ? [full.split("\\").join("/")] : [];
  });
}

const MODULES = [
  {
    fullModule: "@/lib/constants/corporations",
    slimModule: "@/lib/constants/corporationsClient",
    slimNames: new Set(Object.keys(corporationsClient)),
    fullNames: new Set(Object.keys(corporations)),
  },
  {
    fullModule: "@/lib/constants/commodities",
    slimModule: "@/lib/constants/commoditiesCore",
    slimNames: new Set(Object.keys(commoditiesCore)),
    fullNames: new Set(Object.keys(commodities)),
  },
];

function importedNames(statement: string): string[] {
  const braced = statement.match(/\{([\s\S]*)\}/);
  if (!braced) return [];
  return braced[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      part
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0]!
        .trim()
    );
}

describe("client-safe constants guards", () => {
  it("has no use client module importing a full constants module for slim-only names", () => {
    const files = ROOTS.flatMap(sourceFiles);
    expect(files.length).toBeGreaterThan(100);

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (!/^\s*["']use client["']/m.test(source.slice(0, 400))) continue;

      for (const entry of MODULES) {
        const pattern = new RegExp(
          `import\\s+(type\\s+)?\\{[^}]*\\}\\s+from\\s+["']${entry.fullModule}["']`,
          "g"
        );
        for (const match of source.matchAll(pattern)) {
          if (match[1]) continue; // type-only imports are erased by the compiler
          const names = importedNames(match[0]);
          if (names.length > 0 && names.every((name) => entry.slimNames.has(name))) {
            offenders.push(`${file} -> ${entry.slimModule} (${names.join(", ")})`);
          }
        }
      }
    }

    expect(
      offenders,
      `\n${offenders.length} client module(s) import a full constants module for slim-only names:\n` +
        offenders.map((entry) => `  ${entry}`).join("\n") +
        `\n\nImport the slim module instead; the full module re-exports it, so values are identical.\n`
    ).toEqual([]);
  }, 60_000);

  it("keeps every slim export available from the full module", () => {
    for (const entry of MODULES) {
      for (const name of entry.slimNames) {
        expect(entry.fullNames.has(name), `${entry.fullModule} is missing ${name}`).toBe(true);
      }
    }
  });
});
