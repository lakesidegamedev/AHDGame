import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAllElections } from "./fetchAllElections";

afterEach(() => vi.unstubAllGlobals());

describe("fetchAllElections", () => {
  it("pages until every election is read", async () => {
    const pages: Record<string, unknown> = {
      "1": { elections: [{ id: "a" }, { id: "b" }], total: 3, page: 1 },
      "2": { elections: [{ id: "c" }], total: 3, page: 2 },
    };
    const fetchMock = vi.fn(async (url: string) => {
      const page = new URL(url, "http://t").searchParams.get("page")!;
      return new Response(JSON.stringify(pages[page]));
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchAllElections("US", { pageSize: 2 });
    expect(out.elections.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("country=US&view=summary&limit=2&page=1");
  });

  it("reports a failed page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 }))
    );
    const out = await fetchAllElections("US");
    expect(out.elections).toEqual([]);
    expect(out.error).toContain("500");
  });
});
