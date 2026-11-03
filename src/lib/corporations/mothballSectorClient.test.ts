import { afterEach, describe, expect, it, vi } from "vitest";
import { mothballSectorRequest } from "./mothballSectorClient";

afterEach(() => vi.unstubAllGlobals());

describe("mothballSectorRequest", () => {
  it("posts the action to the sector's build route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await mothballSectorRequest("corp-1", "sector-9", "mothball");

    expect(fetchMock).toHaveBeenCalledWith("/api/corporations/corp-1/sectors/sector-9/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mothball" }),
    });
    expect(result.ok).toBe(true);
  });

  it("returns the error body when the route refuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Not CEO" }) })
    );
    const result = await mothballSectorRequest("corp-1", "sector-9", "reactivate");
    expect(result).toEqual({ ok: false, data: { error: "Not CEO" } });
  });

  it("survives a response with no JSON body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => Promise.reject(new Error("x")) })
    );
    expect(await mothballSectorRequest("c", "s", "mothball")).toEqual({ ok: false, data: {} });
  });
});
