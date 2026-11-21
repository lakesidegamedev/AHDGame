import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { withNoStore } from "./withNoStore";

describe("withNoStore", () => {
  it("stamps Cache-Control: no-store, no-transform on a response with no cache header", async () => {
    const handler = withNoStore(async () => NextResponse.json({ ok: true }));
    const res = await handler();
    expect(res.headers.get("Cache-Control")).toBe("no-store, no-transform");
  });

  it("preserves a Cache-Control header the handler set itself", async () => {
    const handler = withNoStore(async () =>
      NextResponse.json({ ok: true }, { headers: { "Cache-Control": "public, s-maxage=60" } })
    );
    const res = await handler();
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=60");
  });

  it("forwards handler arguments and return value", async () => {
    const handler = withNoStore(async (n: number) => NextResponse.json({ n }));
    const res = await handler(7);
    expect(await res.json()).toEqual({ n: 7 });
    expect(res.headers.get("Cache-Control")).toBe("no-store, no-transform");
  });

  it("still stamps no-store on error/non-200 responses", async () => {
    const handler = withNoStore(async () => NextResponse.json({ error: "nope" }, { status: 401 }));
    const res = await handler();
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store, no-transform");
  });

  it("returns a large JSON body as readable plain JSON while origin compression is off", async () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ i, label: "repetitive value" }));
    const handler = withNoStore(async (_request: Request) => NextResponse.json({ rows }));
    const res = await handler(
      new Request("https://example.test/api/thing", {
        headers: { "accept-encoding": "br, gzip" },
      })
    );
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(res.headers.get("Cache-Control")).toBe("no-store, no-transform");
    expect(await res.json()).toEqual({ rows });
  });

  it("does not compress when the handler opts out", async () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ i }));
    const handler = withNoStore(async (_request: Request) => NextResponse.json({ rows }), {
      compress: false,
    });
    const res = await handler(
      new Request("https://example.test/api/thing", {
        headers: { "accept-encoding": "gzip" },
      })
    );
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(await res.json()).toEqual({ rows });
  });
});
