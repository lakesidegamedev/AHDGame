/**
 * Transitive client module graph for the root layout.
 *
 * The root layout and template are server components, so only the modules they
 * hand to a "use client" component reach the browser. This walks those roots
 * through static value imports (type imports are erased by the compiler) and
 * ranks the app source modules by bytes, printing the import chain that pulls
 * each one in.
 *
 * Dynamic imports are not part of the eager graph: next/dynamic puts them in a
 * separate chunk, which is why cutting a heavy leaf to a dynamic import drops
 * it out of this total.
 *
 * Usage:
 *   node scripts/perf/page-load/client-graph.mjs [--root=<file>] [--top=40]
 *     [--json=<out.json>]
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const srcRoot = path.join(repoRoot, "src");
const topN = Number(arg("top", "40"));
const jsonOut = arg("json", "");
const roots = arg("root", "src/app/layout.tsx,src/app/template.tsx")
  .split(",")
  .map((p) => path.resolve(repoRoot, p));
// Layout and template are server components. Their client boundary is whichever
// of their local imports carry "use client"; server-only imports (auth, db,
// metadata) never reach the browser and must not count.
const rootsAreClient = process.argv.includes("--direct-roots");

const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"];

function resolveSpecifier(fromFile, spec) {
  let base;
  if (spec.startsWith(".")) {
    base = path.resolve(path.dirname(fromFile), spec);
  } else if (spec.startsWith("@/")) {
    base = path.join(srcRoot, spec.slice(2));
  } else if (spec.startsWith("@shared/")) {
    base = path.join(repoRoot, "shared", spec.slice("@shared/".length));
  } else if (spec.startsWith("src/")) {
    base = path.join(repoRoot, spec);
  } else {
    return null;
  }
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  for (const ext of EXTENSIONS.filter(Boolean)) {
    const candidate = path.join(base, `index${ext}`);
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function isTypeOnlyClause(clause) {
  const trimmed = clause.trim();
  if (trimmed.startsWith("type ")) return true;
  const braced = trimmed.match(/^\{([\s\S]*)\}$/);
  if (braced) {
    const specifiers = braced[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return specifiers.length > 0 && specifiers.every((s) => s.startsWith("type "));
  }
  return false;
}

/** Eager and dynamic specifiers in source order; type-only imports are dropped. */
function scanImports(source) {
  const eager = [];
  const dynamic = [];

  for (const m of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    dynamic.push(m[1]);
  }
  // Remove dynamic calls so the static patterns below cannot see them twice.
  const staticSource = source.replace(/\bimport\s*\(\s*["'][^"']+["']\s*\)/g, "");

  for (const m of staticSource.matchAll(/\bimport\s+["']([^"']+)["']/g)) {
    eager.push(m[1]);
  }
  for (const m of staticSource.matchAll(
    /\bimport\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g
  )) {
    const [, typeKeyword, clause, spec] = m;
    if (typeKeyword) continue;
    if (isTypeOnlyClause(clause)) continue;
    eager.push(spec);
  }
  for (const m of staticSource.matchAll(
    /\bexport\s+(type\s+)?(?:\*|\{[\s\S]*?\})\s+from\s+["']([^"']+)["']/g
  )) {
    const [, typeKeyword, spec] = m;
    if (typeKeyword) continue;
    eager.push(spec);
  }

  return { eager, dynamic };
}

async function main() {
  const graph = new Map(); // file -> { bytes, client, chain }
  const eagerFiles = new Set();
  const dynamicFiles = new Set();
  const external = new Map();

  async function visit(file, chain, mode) {
    const targetSet = mode === "eager" ? eagerFiles : dynamicFiles;
    const otherSet = mode === "eager" ? dynamicFiles : eagerFiles;
    const existing = graph.get(file);
    if (existing) {
      if (targetSet.has(file)) {
        if (mode === "eager" && existing.chain.length > chain.length) {
          existing.chain = [...chain, file];
        }
        return;
      }
      targetSet.add(file);
      // A module first seen dynamically can still be promoted to eager later.
      if (mode === "dynamic" && otherSet.has(file)) return;
    } else {
      const source = await readFile(file, "utf8");
      const isClient = /^\s*(["'])use client\1/m.test(source.slice(0, 400));
      const { eager: eagerSpecs, dynamic: dynamicSpecs } = scanImports(source);
      const record = {
        bytes: Buffer.byteLength(source),
        client: isClient,
        chain: [...chain, file],
      };
      graph.set(file, record);
      targetSet.add(file);

      for (const spec of eagerSpecs) {
        const resolved = resolveSpecifier(file, spec);
        if (!resolved) {
          external.set(spec, (external.get(spec) ?? 0) + 1);
          continue;
        }
        await visit(resolved, record.chain, mode);
      }
      for (const spec of dynamicSpecs) {
        const resolved = resolveSpecifier(file, spec);
        if (!resolved) {
          external.set(spec, (external.get(spec) ?? 0) + 1);
          continue;
        }
        await visit(resolved, record.chain, "dynamic");
      }
      return;
    }

    // Already known but newly reached eagerly: keep the shorter chain.
    if (mode === "eager" && existing && existing.chain.length > chain.length) {
      existing.chain = [...chain, file];
    }
  }

  for (const root of roots) {
    if (rootsAreClient) {
      await visit(root, [], "eager");
      continue;
    }
    const source = await readFile(root, "utf8");
    const { eager: specs } = scanImports(source);
    for (const spec of specs) {
      const resolved = resolveSpecifier(root, spec);
      if (!resolved) continue;
      if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(resolved)) continue;
      const target = await readFile(resolved, "utf8");
      if (!/^\s*(["'])use client\1/m.test(target.slice(0, 400))) continue;
      await visit(resolved, [], "eager");
    }
  }

  const rel = (file) => path.relative(repoRoot, file);
  const pureDynamic = [...dynamicFiles].filter((f) => !eagerFiles.has(f));

  const rows = [...graph.entries()]
    .filter(([file]) => eagerFiles.has(file))
    .map(([file, rec]) => ({
      file: rel(file),
      bytes: rec.bytes,
      client: rec.client,
      chain: rec.chain.map(rel),
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const total = rows.reduce((sum, r) => sum + r.bytes, 0);
  const clientTotal = rows.filter((r) => r.client).reduce((sum, r) => sum + r.bytes, 0);
  console.log(`roots: ${roots.map(rel).join(", ")}`);
  console.log(
    `eager modules: ${rows.length} (${rows.filter((r) => r.client).length} client) ` +
      `source bytes: ${total} (${clientTotal} client)`
  );
  console.log(`dynamic-only modules: ${pureDynamic.length}`);
  console.log("");
  console.log(`Top ${topN} by source bytes:`);
  for (const [i, row] of rows.slice(0, topN).entries()) {
    console.log(`${String(i + 1).padStart(2)}. ${String(row.bytes).padStart(7)}  ${row.file}`);
    console.log(`    chain: ${row.chain.join(" -> ")}`);
  }

  if (jsonOut) {
    await writeFile(
      jsonOut,
      JSON.stringify(
        {
          roots: roots.map(rel),
          totalBytes: total,
          clientBytes: clientTotal,
          modules: rows,
          dynamicOnly: pureDynamic.map(rel),
          external: [...external.entries()].sort((a, b) => b[1] - a[1]),
        },
        null,
        2
      )
    );
    console.log(`\nwrote ${jsonOut}`);
  }
}

await main();
