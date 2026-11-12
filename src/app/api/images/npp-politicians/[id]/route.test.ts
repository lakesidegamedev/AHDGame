import { afterEach, describe, expect, it, vi } from "vitest";
import pool from "@/data/npp-politician-images.json";
import { portraitToken } from "@/lib/npp/portraitTokens";
import { GET } from "./route";

const sample = (pool as Array<{ id: string; name: string; url: string }>).find(
  (p) => p.id === "donald-trump"
)!;

function call(id: string) {
  return GET(new Request(`https://example.test/api/images/npp-politicians/${id}`), {
    params: Promise.resolve({ id }),
  });
}

function mockUpstream(contentType = "image/jpeg", status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3]), {
      status,
      headers: { "content-type": contentType },
    })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/images/npp-politicians/[id]", () => {
  it("serves the portrait bytes for an opaque token without naming the subject", async () => {
    const fetchMock = mockUpstream();
    const res = await call(portraitToken(sample.id));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(sample.url, expect.anything());
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("content-type")).toBe("image/jpeg");

    const headerText = [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\n");
    const surname = sample.name.split(" ").pop()!;
    expect(headerText).not.toContain(sample.id);
    expect(headerText.toLowerCase()).not.toContain(surname.toLowerCase());
    expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.from([1, 2, 3]));
  });

  it("keeps resolving legacy pool ids stored by earlier worlds", async () => {
    mockUpstream();
    expect((await call(sample.id)).status).toBe(200);
  });

  it("404s an unknown id without calling upstream", async () => {
    const fetchMock = mockUpstream();
    expect((await call("p-0000000000000000")).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("502s when the source is down or not an image", async () => {
    mockUpstream("text/html");
    expect((await call(portraitToken(sample.id))).status).toBe(502);
    mockUpstream("image/jpeg", 500);
    expect((await call(portraitToken(sample.id))).status).toBe(502);
  });
});
