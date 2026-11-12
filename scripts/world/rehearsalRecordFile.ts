import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import type { RehearsalRecordLike } from "@/lib/admin/resetRehearsal/gate";

function git(args: string[]): string {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

export const currentHead = () => git(["rev-parse", "HEAD"]);

/** The tree hash survives a merge commit over identical content; the sha does not. */
export const currentTreeHash = () => git(["rev-parse", "HEAD^{tree}"]);

export function readRehearsalRecord(path: string): RehearsalRecordLike | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RehearsalRecordLike;
  } catch {
    return null;
  }
}
