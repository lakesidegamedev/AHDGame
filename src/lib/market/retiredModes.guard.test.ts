import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Names are assembled so this file never matches its own scan.
const RETIRED_IDENTIFIERS = [["freight", "Settlement", "Mode"].join("")];

const ROOTS = ["src", "scripts"];
const SKIP_DIRS = new Set(["node_modules", ".next", "reports"]);
const EXTENSIONS = /\.(ts|tsx|mts|js|mjs|json)$/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (EXTENSIONS.test(name)) out.push(path);
  }
  return out;
}

describe("retired economy mode switches stay removed", () => {
  const files = ROOTS.flatMap((root) => sourceFiles(join(process.cwd(), root))).filter(
    (file) => !file.endsWith("retiredModes.guard.test.ts")
  );

  it.each(RETIRED_IDENTIFIERS)("no source file mentions %s", (identifier) => {
    const offenders = files.filter((file) => readFileSync(file, "utf8").includes(identifier));
    expect(offenders).toEqual([]);
  });
});
