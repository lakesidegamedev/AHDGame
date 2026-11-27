import { beforeEach, expect, it, vi } from "vitest";
import { POST, GET } from "./handlers";
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: async () => ({ ok: true }) }));
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
it.each([
  "{",
  JSON.stringify({ reset: "false" }),
  JSON.stringify({ scope: "CA" }),
  JSON.stringify({ scope: "not-country" }),
  JSON.stringify({ preset: "2028-typo" }),
  JSON.stringify({ targets: 4 }),
  JSON.stringify({ targtes: ["indexes"] }),
  JSON.stringify({ targets: ["missing-target"] }),
])("rejects invalid seed input before opening the database: %s", async (body) => {
  const response = await POST(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    })
  );
  expect(response.status).toBe(400);
  const { getDb } = await import("@/lib/mongodb");
  expect(getDb).not.toHaveBeenCalled();
});
it("advertises only scopes with an implemented target list", async () => {
  const data = await (await GET()).json();
  expect(data.scope).toEqual(["US", "UK", "JP", "DE", "IE", "BR", "CN", "NG", "both"]);
});
