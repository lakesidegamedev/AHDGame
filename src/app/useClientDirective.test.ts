import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "use client" only works as the first statement of a file. An import placed
 * above it (or a formatter wrapping it in parentheses) silently turns the file
 * into a server component.
 */

const SRC = join(process.cwd(), "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx|ts)$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

describe("client directive", () => {
  it("is the first statement wherever it appears", () => {
    const offenders: string[] = [];
    for (const file of files(SRC)) {
      const source = readFileSync(file, "utf8");
      if (!/["']use client["']/.test(source)) continue;
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("//"));
      const directiveLine = code.findIndex((line) => /^\(?["']use client["']\)?;?$/.test(line));
      if (directiveLine === -1) continue;
      if (directiveLine !== 0 || code[0].startsWith("(")) offenders.push(relative(SRC, file));
    }
    expect(offenders).toEqual([]);
  }, 60_000);
});
