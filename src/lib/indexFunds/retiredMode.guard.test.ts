import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Names are assembled so this file never matches its own scan.
const RETIRED_IDENTIFIERS = [
  ["index", "Funds", "Mode"].join(""),
  ["index", "Funds", "Enabled"].join(""),
  ["is", "IndexFunds", "Enabled"].join(""),
  ["is", "IndexFunds", "FullMode"].join(""),
  ["get", "IndexFunds", "Mode"].join(""),
  ["INDEX_FUNDS_", "DISABLED_MESSAGE"].join(""),
  ["INDEX_FUNDS_", "PARTIAL_MESSAGE"].join(""),
];

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

describe("the retired index funds mode switch stays removed", () => {
  const files = ROOTS.flatMap((root) => sourceFiles(join(process.cwd(), root))).filter(
    (file) => !file.endsWith("retiredMode.guard.test.ts")
  );

  it.each(RETIRED_IDENTIFIERS)("no source file mentions %s", (identifier) => {
    const offenders = files.filter((file) => readFileSync(file, "utf8").includes(identifier));
    expect(offenders).toEqual([]);
  });
});
