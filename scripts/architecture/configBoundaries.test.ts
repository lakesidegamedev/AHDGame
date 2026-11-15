import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

function rel(file: string): string {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

const FILES = sourceFiles(SRC).map((file) => ({
  file: rel(file),
  text: readFileSync(file, "utf8"),
}));

// Next inlines NEXT_PUBLIC_* and NODE_ENV at build time, so they stay literal
// wherever they are read. Tests, test fixtures and perf harnesses are not
// server runtime.
const ENV_ALLOWED_PATH = [
  /^src\/lib\/config\//,
  /\.test\.tsx?$/,
  /^src\/lib\/test-utils\//,
  /\/__perf__\//,
];
const ENV_READ = /process\.env(?!\.(?:NEXT_PUBLIC_[A-Z0-9_]+|NODE_ENV)\b)/g;

function findStrayEnvReads(file: string, text: string): string[] {
  if (ENV_ALLOWED_PATH.some((pattern) => pattern.test(file))) return [];
  const hits: string[] = [];
  for (const match of text.matchAll(ENV_READ)) {
    const line = text.slice(0, match.index).split("\n").length;
    hits.push(`${file}:${line}`);
  }
  return hits;
}

describe("environment reads", () => {
  it("flags a direct read outside the config module", () => {
    expect(findStrayEnvReads("src/lib/x.ts", "const a = process.env.GIT_TOKEN;")).toHaveLength(1);
    expect(findStrayEnvReads("src/lib/x.ts", "f(process.env);")).toHaveLength(1);
    expect(findStrayEnvReads("src/lib/x.ts", 'const a = process.env["X"];')).toHaveLength(1);
  });

  it("allows build-time inlined values and the config module", () => {
    expect(findStrayEnvReads("src/lib/x.ts", "process.env.NEXT_PUBLIC_BASE_URL")).toEqual([]);
    expect(findStrayEnvReads("src/lib/x.ts", "process.env.NODE_ENV")).toEqual([]);
    expect(findStrayEnvReads("src/lib/config/auth.ts", "process.env.AUTH_SECRET")).toEqual([]);
  });

  it("reads server configuration only through src/lib/config", () => {
    const stray = FILES.flatMap(({ file, text }) => findStrayEnvReads(file, text));
    expect(stray, "read these through an accessor in src/lib/config").toEqual([]);
  });
});

describe("retired UK path", () => {
  it("keeps src/lib/uk deleted", () => {
    expect(existsSync(path.join(SRC, "lib", "uk"))).toBe(false);
  });

  it("imports UK modules from src/lib/countries/uk", () => {
    const stale = FILES.filter(({ text }) => /["']@\/lib\/uk(?:\/|["'])/.test(text)).map(
      ({ file }) => file
    );
    expect(stale).toEqual([]);
  });
});
