import { describe, expect, it } from "vitest";
import { NonJsonResponseError, readJsonResponse } from "./readJsonResponse";

describe("readJsonResponse", () => {
  it("parses a JSON body", async () => {
    const res = new Response(JSON.stringify({ a: 1 }), { status: 200 });
    await expect(readJsonResponse<{ a: number }>(res)).resolves.toEqual({ a: 1 });
  });

  it("throws a plain error for binary bytes", async () => {
    const res = new Response(new Uint8Array([0x1b, 0x9f, 0x00, 0x42]), { status: 200 });
    const err = await readJsonResponse(res).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NonJsonResponseError);
    expect((err as Error).message).not.toContain("Unexpected token");
  });

  it("throws a plain error for an HTML error page", async () => {
    const res = new Response("<html>bad gateway</html>", { status: 502 });
    await expect(readJsonResponse(res)).rejects.toBeInstanceOf(NonJsonResponseError);
  });
});
