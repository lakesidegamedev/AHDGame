import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  compressJsonResponse,
  compressedJson,
  MIN_JSON_COMPRESS_BYTES,
  negotiateJsonEncoding,
} from "./jsonCompression";

function requestWithAcceptEncoding(acceptEncoding?: string): Request {
  const headers = new Headers();
  if (acceptEncoding) headers.set("accept-encoding", acceptEncoding);
  return new Request("https://example.test/api/thing", { headers });
}

function bigPayload(): { rows: Array<{ id: number; label: string }> } {
  return {
    rows: Array.from({ length: 200 }, (_, i) => ({
      id: i,
      label: `A reasonably repetitive label for row ${i}`,
    })),
  };
}

async function decode(res: Response): Promise<unknown> {
  const encoding = res.headers.get("content-encoding");
  const raw = Buffer.from(await res.arrayBuffer());
  if (encoding === "gzip") return JSON.parse(gunzipSync(raw).toString("utf8"));
  if (encoding === "br") return JSON.parse(brotliDecompressSync(raw).toString("utf8"));
  return JSON.parse(raw.toString("utf8"));
}

describe("negotiateJsonEncoding", () => {
  it("returns null when no Accept-Encoding header is sent", () => {
    expect(negotiateJsonEncoding(null)).toBeNull();
    expect(negotiateJsonEncoding("")).toBeNull();
  });

  it("prefers Brotli when the client accepts both", () => {
    expect(negotiateJsonEncoding("gzip, deflate, br")).toBe("br");
    expect(negotiateJsonEncoding("br, gzip")).toBe("br");
  });

  it("honours q-values", () => {
    expect(negotiateJsonEncoding("br;q=0.5, gzip;q=1.0")).toBe("gzip");
    expect(negotiateJsonEncoding("gzip;q=0, br;q=0.9")).toBe("br");
  });

  it("falls back to gzip when Brotli is not offered", () => {
    expect(negotiateJsonEncoding("gzip, deflate")).toBe("gzip");
    expect(negotiateJsonEncoding("x-gzip")).toBe("gzip");
  });

  it("refuses encodings the client explicitly rejects", () => {
    expect(negotiateJsonEncoding("identity")).toBeNull();
    expect(negotiateJsonEncoding("br;q=0, gzip;q=0")).toBeNull();
    expect(negotiateJsonEncoding("*;q=0")).toBeNull();
  });

  it("treats a wildcard as permission for the encodings we support", () => {
    expect(negotiateJsonEncoding("*")).toBe("br");
  });
});

describe("compressJsonResponse", () => {
  it("gzip-compresses a large JSON body and marks it with Vary", async () => {
    const res = await compressedJson(requestWithAcceptEncoding("gzip"), bigPayload());
    expect(res.headers.get("content-encoding")).toBe("gzip");
    expect(res.headers.get("vary")?.toLowerCase()).toContain("accept-encoding");
    expect(Number(res.headers.get("content-length"))).toBeGreaterThan(0);
    expect(await decode(res)).toEqual(bigPayload());
  });

  it("brotli-compresses when the client prefers it", async () => {
    const res = await compressedJson(requestWithAcceptEncoding("gzip, br"), bigPayload());
    expect(res.headers.get("content-encoding")).toBe("br");
    expect(await decode(res)).toEqual(bigPayload());
  });

  it("cuts the transferred body by at least 80% on a repetitive JSON payload", async () => {
    const raw = Buffer.byteLength(JSON.stringify(bigPayload()));
    const res = await compressedJson(requestWithAcceptEncoding("gzip"), bigPayload());
    const sent = Number(res.headers.get("content-length"));
    expect(sent).toBeLessThan(raw * 0.2);
    expect(raw).toBeGreaterThan(MIN_JSON_COMPRESS_BYTES);
  });

  it("leaves the body uncompressed when the client does not accept an encoding", async () => {
    const res = await compressJsonResponse(
      new Response(JSON.stringify(bigPayload()), {
        headers: { "content-type": "application/json" },
      }),
      requestWithAcceptEncoding()
    );
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(await decode(res)).toEqual(bigPayload());
  });

  it("does not spend CPU compressing bodies below the threshold", async () => {
    const res = await compressedJson(requestWithAcceptEncoding("gzip"), { ok: true });
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(await decode(res)).toEqual({ ok: true });
  });

  it("ignores non-JSON bodies", async () => {
    const res = await compressJsonResponse(
      new Response("id,name\n1,Alice\n2,Bob\n".repeat(200), {
        headers: { "content-type": "text/csv" },
      }),
      requestWithAcceptEncoding("gzip")
    );
    expect(res.headers.get("content-encoding")).toBeNull();
  });

  it("leaves a body that is already encoded alone", async () => {
    const res = await compressJsonResponse(
      new Response(JSON.stringify(bigPayload()), {
        headers: { "content-type": "application/json", "content-encoding": "gzip" },
      }),
      requestWithAcceptEncoding("br")
    );
    expect(res.headers.get("content-encoding")).toBe("gzip");
  });

  it("never touches 304 Not Modified", async () => {
    const res = await compressJsonResponse(
      new Response(null, { status: 304, headers: { "content-type": "application/json" } }),
      requestWithAcceptEncoding("gzip")
    );
    expect(res.headers.get("content-encoding")).toBeNull();
  });

  it("keeps a route's own Cache-Control intact", async () => {
    const res = await compressedJson(requestWithAcceptEncoding("gzip"), bigPayload(), {
      headers: { "Cache-Control": "no-store, no-transform" },
    });
    expect(res.headers.get("cache-control")).toBe("no-store, no-transform");
    expect(res.headers.get("content-encoding")).toBe("gzip");
  });

  it("preserves every Set-Cookie header instead of comma-joining them", async () => {
    const headers = new Headers({ "content-type": "application/json" });
    headers.append("set-cookie", "a=1; Path=/; HttpOnly");
    headers.append("set-cookie", "b=2; Path=/; HttpOnly");
    const res = await compressJsonResponse(
      new Response(JSON.stringify(bigPayload()), { headers }),
      requestWithAcceptEncoding("gzip")
    );
    expect(res.headers.getSetCookie()).toEqual(["a=1; Path=/; HttpOnly", "b=2; Path=/; HttpOnly"]);
  });

  it("does not duplicate an existing Accept-Encoding entry in Vary", async () => {
    const res = await compressJsonResponse(
      new Response(JSON.stringify(bigPayload()), {
        headers: { "content-type": "application/json", vary: "Accept-Encoding" },
      }),
      requestWithAcceptEncoding("gzip")
    );
    expect(res.headers.get("vary")).toBe("Accept-Encoding");
  });
});
