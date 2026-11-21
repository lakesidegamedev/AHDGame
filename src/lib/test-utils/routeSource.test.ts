import path from "node:path";
import { describe, expect, it } from "vitest";
import { readRouteSource } from "./routeSource";

describe("route guard source discovery", () => {
  const route = path.resolve("src/app/api/admin/example/route.ts");
  const handler = path.resolve("src/lib/api/commands/admin/example/handlers.ts");
  const imported =
    'import { POST as handlePOST } from "@/lib/api/commands/admin/example/handlers";';
  const command = "export async function POST() { await requireAdmin(); }";
  const read = (source: string) => (file: string) => {
    if (file === route) return source;
    if (file === handler) return command;
    throw new Error("Unexpected source file");
  };
  it("follows an exported HTTP adapter to the actual guard", () => {
    const source = imported + " export function POST(...args) { return handlePOST(...args); }";
    expect(readRouteSource(route, read(source))).toContain("requireAdmin()");
  });
  it("does not accept an unused import as a guarded route", () => {
    const source = imported + " export function POST() { return response(); }";
    expect(readRouteSource(route, read(source))).not.toContain("requireAdmin()");
  });
  it("does not follow calls from non-exported helpers", () => {
    const source = imported + " function POST() { return handlePOST(); }";
    expect(readRouteSource(route, read(source))).not.toContain("requireAdmin()");
  });
});
