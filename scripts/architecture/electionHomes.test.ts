import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Election rules and shells are consolidating into src/lib/elections. The older
// homes only shrink: a new file there fails this test, and a file that moved or
// was deleted must come out of the baseline so the count can only fall.
const ROOT = process.cwd();
const OLD_HOMES = [
  "src/lib/electionEngine",
  "src/lib/turn/election",
  "src/lib/turn/elections",
  "src/lib/turn/perpetualElections",
];
const OLD_FILES = [
  "src/lib/electionEngine.ts",
  "src/lib/presidentialElectionEngine.ts",
  "src/lib/nigeriaPresidentialElectionEngine.ts",
];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(name)) out.push(path.relative(ROOT, full).replace(/\\/g, "/"));
  }
  return out;
}

const baseline = (
  JSON.parse(
    readFileSync(path.join(ROOT, "scripts/architecture/electionHomes.baseline.json"), "utf8")
  ) as {
    files: string[];
  }
).files;

describe("election code homes", () => {
  const current = [
    ...OLD_HOMES.flatMap((dir) => walk(path.join(ROOT, dir))),
    ...OLD_FILES.filter((f) => existsSync(path.join(ROOT, f))),
  ];

  it("adds no file to the older election homes", () => {
    const added = current.filter((file) => !baseline.includes(file)).sort();
    expect(added, "new election code belongs in src/lib/elections").toEqual([]);
  });

  it("drops moved or deleted files from the baseline", () => {
    const stale = baseline.filter((file) => !current.includes(file)).sort();
    expect(stale, "remove these from electionHomes.baseline.json").toEqual([]);
  });

  it("keeps every forwarder a one-line re-export", () => {
    const bad = current.filter((file) => {
      const text = readFileSync(path.join(ROOT, file), "utf8");
      return /Forwarder\./.test(text) && !/^export \* from "@\/lib\/[^"]+";\s*$/m.test(text);
    });
    expect(bad).toEqual([]);
  });
});
