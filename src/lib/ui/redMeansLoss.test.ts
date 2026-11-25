import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { dispatchStatusMeta } from "@/components/legislature/dispatch/status";

/**
 * Red is for money lost, negative figures and errors. Approval, vacancies and
 * vetoes are not losses: approval and vacancies use the warning token, a veto
 * is a neutral outlined label. Party identity colours are data and untouched.
 */

const SRC = join(process.cwd(), "src");
const RED = /\b(?:text|bg|border)-(?:error|red-\d{3})\b/;

function tsx(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsx(path);
    return /\.(tsx|ts)$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

/** Whole-repository scans; give them room on a loaded machine. */
const SCAN_TIMEOUT_MS = 60_000;

describe("red means money lost or an error", () => {
  it(
    "styles every veto status as a neutral outlined label",
    () => {
      expect(dispatchStatusMeta("vetoed").tone).toBe("neutral");
      expect(dispatchStatusMeta("override_failed").tone).toBe("neutral");
      const offenders: string[] = [];
      for (const file of tsx(SRC)) {
        const source = readFileSync(file, "utf8");
        for (const match of source.matchAll(/\bvetoed:\s*"([^"]*)"/g)) {
          if (RED.test(match[1])) offenders.push(`${relative(SRC, file)}: ${match[1]}`);
        }
      }
      expect(offenders).toEqual([]);
    },
    SCAN_TIMEOUT_MS
  );

  it(
    "keeps approval ratings and vacancies off red",
    () => {
      const offenders: string[] = [];
      for (const file of tsx(SRC)) {
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, index) => {
          if (/approval|vacan/i.test(line) && RED.test(line) && !/console\./.test(line)) {
            offenders.push(`${relative(SRC, file)}:${index + 1}`);
          }
        });
      }
      expect(offenders).toEqual([]);
    },
    SCAN_TIMEOUT_MS
  );
});
