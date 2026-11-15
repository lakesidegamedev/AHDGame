import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CORPORATION_TYPES, OPERATING_SECTOR_TYPES } from "./corporations";

/**
 * Automobiles and entertainment are no longer operating lanes. Manufacturing
 * makes vehicles and media sells advertising, with no lane id and no stored
 * model or discriminator field. None of the retired identifiers may come back
 * anywhere in src.
 */
const SRC_ROOT = join(__dirname, "..", "..");

const RETIRED_TOKENS = [
  ["media", "entertainment"].join("_"),
  ["manufacturing", "vehicles"].join("_"),
  ["media", "Discriminator"].join(""),
  ["industry", "Model"].join(""),
];

const SELF = "lib/constants/retiredLanes.guard.test.ts";

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const name = entry.name;
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    const directory = entry.isDirectory() || (!entry.isFile() && statSync(path).isDirectory());
    if (directory) sourceFiles(path, out);
    else if (/\.(ts|tsx|json|md)$/.test(name)) out.push(path);
  }
  return out;
}

function offences(file: string, text: string): string[] {
  const found: string[] = [];
  text.split("\n").forEach((line, index) => {
    for (const token of RETIRED_TOKENS) {
      if (line.includes(token)) found.push(`${file}:${index + 1}: ${line.trim()}`);
    }
  });
  return found;
}

describe("retired operating lanes", () => {
  it("detects each retired identifier", () => {
    for (const token of RETIRED_TOKENS) {
      expect(offences("fixture.ts", `const x = { ${token}: 1 };`)).toHaveLength(1);
    }
    expect(offences("fixture.ts", 'sectorType: "manufacturing"')).toHaveLength(0);
  });

  it("are not corporation types or operating sector types", () => {
    for (const token of RETIRED_TOKENS) {
      expect(CORPORATION_TYPES as readonly string[]).not.toContain(token);
      expect(OPERATING_SECTOR_TYPES as readonly string[]).not.toContain(token);
    }
    expect(OPERATING_SECTOR_TYPES).toEqual(CORPORATION_TYPES);
  });

  it("do not reappear anywhere in src", () => {
    const found = sourceFiles(SRC_ROOT).flatMap((path) => {
      const file = relative(SRC_ROOT, path).split("\\").join("/");
      if (file === SELF) return [];
      return offences(file, readFileSync(path, "utf8"));
    });
    expect(found).toEqual([]);
    // Walks and reads every file under src; on a loaded CI shard this can exceed the
    // default 15s, so give the scan its own budget.
  }, 60_000);
});
