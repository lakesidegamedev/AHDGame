import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const LIB_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** `_id: { $regex: `...` }`, the shape every claim and receipt lookup uses. */
const ID_REGEX = /(?:^|[{,\s])["']?_id["']?\s*:\s*\{\s*\$regex\s*:\s*`([^`]*)`/gm;

/**
 * An alternation or group after an anchor disables MongoDB's index bounds, so
 * the server walks every key instead of one prefix range (goal 2 measured a
 * 264k-key walk per call). Interpolated values are code, not pattern text:
 * `^${escapeRegex(prefix)}` is a plain prefix even though the source contains
 * a parenthesis.
 */
export function findAlternatingIdRegexes(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(ID_REGEX)) {
    const pattern = match[1]!.replace(/\$\{[^}]*\}/g, "");
    if (/[|(]/.test(pattern)) found.push(match[1]!);
  }
  return found;
}

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__snapshots__") continue;
      files.push(...sourceFiles(path));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(path);
    }
  }
  return files;
}

describe("_id prefix regexes", () => {
  it("flags alternation and groups but not interpolated code", () => {
    expect(findAlternatingIdRegexes("_id: { $regex: `^a|b` }")).toEqual(["^a|b"]);
    expect(findAlternatingIdRegexes("_id: { $regex: `^(a|b)` }")).toEqual(["^(a|b)"]);
    expect(findAlternatingIdRegexes("_id: { $regex: `^${escapeRegex(prefix)}` }")).toEqual([]);
  });

  it("keeps every src/lib _id regex a plain literal prefix", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(LIB_ROOT)) {
      if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
      const source = readFileSync(file, "utf8");
      for (const pattern of findAlternatingIdRegexes(source)) {
        const index = source.indexOf(pattern);
        const line = source.slice(0, index).split("\n").length;
        offenders.push(`${relative(LIB_ROOT, file)}:${line}: $regex \`${pattern}\``);
      }
    }
    expect(offenders).toEqual([]);
  });
});
