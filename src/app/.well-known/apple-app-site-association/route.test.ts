import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /.well-known/apple-app-site-association", () => {
  it("serves JSON that opens game pages in the app and keeps account paths in the browser", async () => {
    const res = GET();
    expect(res.headers.get("content-type")).toBe("application/json");
    const body = await res.json();
    const detail = body.applinks.details[0];
    expect(detail.appIDs).toEqual(["QNQ5G88K5D.net.lakesidegames.ahdclient"]);
    const excluded = detail.components.filter((c: { exclude?: boolean }) => c.exclude).map((c: { "/": string }) => c["/"]);
    expect(excluded).toEqual(["/api/*", "/login*", "/auth*", "/register*", "/logout*"]);
    expect(detail.components.at(-1)).toEqual({ "/": "/*" });
  });
});
