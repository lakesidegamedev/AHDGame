import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import * as barrel from "../constants";
import * as flags from "./flags";
import * as usStateCodes from "./usStateCodes";

/**
 * Browser modules must not import the `@/lib/constants` barrel for names that
 * have a slim module: the barrel pulls every country seat table into the page.
 */

const ROOTS = ["src/app", "src/components", "src/hooks", "src/contexts", "src/lib"];

const SLIM_NAMES = new Map<string, string>([
  ...Object.keys(flags).map((name) => [name, "@/lib/constants/flags"] as [string, string]),
  ...Object.keys(usStateCodes).map(
    (name) => [name, "@/lib/constants/usStateCodes"] as [string, string]
  ),
]);

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

describe("client barrel guard", () => {
  it("keeps slim names available from the barrel", () => {
    for (const name of SLIM_NAMES.keys()) {
      expect(Object.keys(barrel), `barrel is missing ${name}`).toContain(name);
    }
  });

  it("has no use client module importing slim-only names from the barrel", () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap(sourceFiles)) {
      const source = readFileSync(file, "utf8");
      if (!/^\s*["']use client["']/m.test(source.slice(0, 400))) continue;
      const pattern = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']@\/lib\/constants["']/g;
      for (const match of source.matchAll(pattern)) {
        if (match[1]) continue;
        const names = match[2]!
          .split(",")
          .map((part) =>
            part
              .trim()
              .replace(/^type\s+/, "")
              .split(/\s+as\s+/)[0]!
              .trim()
          )
          .filter(Boolean);
        if (names.length > 0 && names.every((name) => SLIM_NAMES.has(name))) {
          offenders.push(`${file} (${names.join(", ")})`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  }, 60_000);
});
