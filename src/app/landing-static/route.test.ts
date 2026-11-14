import { beforeEach, describe, expect, it, vi } from "vitest";

const build = vi.hoisted(() => vi.fn(async () => "<!doctype html><html></html>"));
vi.mock("@/lib/landing/static/buildStaticLanding", () => ({ buildStaticLandingHtml: build }));

import { GET } from "./route";

beforeEach(() => build.mockClear());

describe("GET /landing-static", () => {
  it("serves the page when the proxy rewrote the home page to it", async () => {
    const res = await GET(
      new Request("https://x.test/landing-static", { headers: { "x-pathname": "/" } })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.text()).toContain("<!doctype html>");
  });

  it("is a 404 when requested directly", async () => {
    const res = await GET(
      new Request("https://x.test/landing-static", { headers: { "x-pathname": "/landing-static" } })
    );
    expect(res.status).toBe(404);
    expect(build).not.toHaveBeenCalled();
  });

  it("is a 404 without the proxy's stamp", async () => {
    expect((await GET(new Request("https://x.test/landing-static"))).status).toBe(404);
  });
});
