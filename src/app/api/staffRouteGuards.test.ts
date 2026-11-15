import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Junior dev read-only enforcement lives in requireAdmin / requireModerator.
 * A staff route that skips those guards would bypass it, so every route under
 * the admin and moderator API trees must go through one of the central guards.
 */
const CENTRAL_GUARDS = [
  "requireAdmin",
  "requireModerator",
  "withAdminAuth",
  "withAdminRoute",
  "requireAdminOrApiKey",
];

/** Routes with a deliberate non-staff audience, each with the reason. */
const EXEMPT: Record<string, string> = {
  "src/app/api/admin/banking/reserve-requirement/route.ts":
    "admin-or-central-bank-chair write; a junior dev is neither, so it is always denied",
};

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

describe("staff API route guards", () => {
  const files = [
    ...routeFiles(join(process.cwd(), "src/app/api/admin")),
    ...routeFiles(join(process.cwd(), "src/app/api/moderator")),
  ];

  it("finds the route trees", () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it("routes every admin and moderator endpoint through a central guard", () => {
    const unguarded = files
      .map((f) => relative(process.cwd(), f).split(sep).join("/"))
      .filter((rel) => !(rel in EXEMPT))
      .filter((rel) => {
        const src = readFileSync(join(process.cwd(), rel), "utf8");
        return !CENTRAL_GUARDS.some((g) => src.includes(g));
      });
    expect(unguarded).toEqual([]);
  });
});
