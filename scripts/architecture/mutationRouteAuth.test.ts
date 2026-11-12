import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { findMutationHandlers, routeKey } from "./mutationRouteAuth";
import { PUBLIC_MUTATION_ROUTES } from "./mutationRouteAuth.allowlist";

const fixtureRoot = mkdtempSync(join(tmpdir(), "mutation-route-auth-"));
afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }));

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(fixtureRoot, "case-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function resolutions(files: Record<string, string>, allowlist: Record<string, string> = {}) {
  return Object.fromEntries(
    findMutationHandlers(fixture(files), allowlist).map((h) => [
      `${h.route.replace(/^src\/app\//, "")} ${h.method}`,
      h.resolution,
    ])
  );
}

describe("mutation route guard resolution", () => {
  it("accepts a guard called in the handler or a route-local helper", () => {
    expect(
      resolutions({
        "src/app/a/route.ts":
          'import { requireAuth } from "@/lib/api/requireAuth";\nexport async function POST() { const auth = await requireAuth(); if (!auth.ok) return auth.response; }',
        "src/app/b/route.ts":
          'import { requireAdmin } from "@/lib/api/requireAdmin";\nasync function check() { return requireAdmin(); }\nexport const DELETE = withNoStore(async () => { await check(); });',
        "src/app/c/route.ts": "export async function GET() { return null; }",
      })
    ).toEqual({ "a/route.ts POST": "inline", "b/route.ts DELETE": "inline" });
  });

  it("follows delegated lib handlers, wrappers and re-exports", () => {
    expect(
      resolutions({
        "src/lib/system/handlers.ts":
          'import { gate } from "./gate";\nexport async function handleCreate(request) { await gate(); }',
        "src/lib/system/gate.ts":
          'import { requireBasicAuth } from "@/lib/api/requireAuth";\nexport async function gate() { return requireBasicAuth(); }',
        "src/lib/withAdmin.ts":
          "export function withAdmin(fn) { return async (r) => { await requireAdmin(); return fn(r); }; }",
        "src/app/a/route.ts":
          'import { handleCreate } from "@/lib/system/handlers";\nexport async function POST(r) { return handleCreate(r); }',
        "src/app/b/route.ts":
          'import { withAdmin } from "@/lib/withAdmin";\nexport const PATCH = withAdmin(async () => null);',
        "src/app/c/route.ts": 'export { POST } from "../a/route";',
      })
    ).toEqual({
      "a/route.ts POST": "handler",
      "b/route.ts PATCH": "handler",
      "c/route.ts POST": "handler",
    });
  });

  it("stops following imports after the configured depth", () => {
    expect(
      resolutions({
        "src/lib/one.ts": 'import { two } from "./two";\nexport function one() { return two(); }',
        "src/lib/two.ts":
          'import { three } from "./three";\nexport function two() { return three(); }',
        "src/lib/three.ts": "export function three() { return requireAuth(); }",
        "src/app/a/route.ts":
          'import { one } from "@/lib/one";\nexport async function POST() { await one(); }',
      })
    ).toEqual({ "a/route.ts POST": "unguarded" });
  });

  it("counts a nullable session lookup only when an anonymous caller exits", () => {
    expect(
      resolutions({
        "src/app/a/route.ts":
          'export async function POST() { const user = await getAuthUser(); if (!user) return errorResponse(401, "x"); }',
        "src/app/b/route.ts":
          'export async function POST() { const user = await getAuthUser().catch(() => null); if (user === null) { throw new Error("x"); } }',
        "src/app/c/route.ts":
          "export async function POST() { const user = await getAuthUser(); log(user?.userId ?? null); }",
        "src/app/d/route.ts":
          'export async function POST() { if (!(await verifyAuth())) return errorResponse(401, "x"); }',
      })
    ).toEqual({
      "a/route.ts POST": "inline",
      "b/route.ts POST": "inline",
      "c/route.ts POST": "unguarded",
      "d/route.ts POST": "inline",
    });
  });

  it("treats a handler that only returns an error as retired", () => {
    expect(
      resolutions({
        "src/app/a/route.ts":
          'export async function POST() { return errorResponse(410, "Moved"); }',
        "src/app/b/route.ts":
          "export async function POST() { return errorResponse(410, await deleteEverything()); }",
      })
    ).toEqual({ "a/route.ts POST": "inert", "b/route.ts POST": "unguarded" });
  });

  it("uses the allowlist only for handlers without a guard", () => {
    const root = fixture({ "src/app/login/route.ts": "export async function POST() {}" });
    const [handler] = findMutationHandlers(root, {
      [routeKey("src/app/login/route.ts", "POST")]: "Pre-login",
    });
    expect(handler?.resolution).toBe("allowlisted");
  });
});

describe("repository mutation routes", () => {
  it("reach an auth guard or are reviewed public endpoints", () => {
    const handlers = findMutationHandlers(process.cwd(), PUBLIC_MUTATION_ROUTES);
    expect(handlers.length).toBeGreaterThan(900);

    const unguarded = handlers.filter((h) => h.resolution === "unguarded");
    expect(
      unguarded.map((h) => routeKey(h.route, h.method)),
      "These mutation handlers do not reach a recognised guard (see the resolution rule in " +
        "scripts/architecture/mutationRouteAuth.ts). Call the guard sibling routes use, or, " +
        "for a genuinely public endpoint, add a reviewed entry to mutationRouteAuth.allowlist.ts."
    ).toEqual([]);

    const allowlisted = new Set(
      handlers.filter((h) => h.resolution === "allowlisted").map((h) => routeKey(h.route, h.method))
    );
    const stale = Object.keys(PUBLIC_MUTATION_ROUTES).filter((key) => !allowlisted.has(key));
    expect(stale, "Remove allowlist entries that no longer name an unguarded handler.").toEqual([]);
    for (const [key, reason] of Object.entries(PUBLIC_MUTATION_ROUTES))
      expect(reason.trim().length, `${key} needs a reason`).toBeGreaterThan(20);
  }, 90_000);
});
