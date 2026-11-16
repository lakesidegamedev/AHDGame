import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  docsItemsToCandidates,
  getDocsIndex,
  parseDocsIndex,
  resetDocsIndexCache,
} from "./docsSearch";

const FIXTURE = [
  { h: "/design/elections.html", t: "Elections", d: "How elections work", s: "Design", tx: "x" },
  { h: "/guide/a.html", t: "A", tx: "Primaries run in waves" },
  { bad: true },
  { h: "no-slash", t: "Bad" },
];

describe("parseDocsIndex", () => {
  it("keeps valid items and drops malformed ones", () => {
    expect(parseDocsIndex(FIXTURE).map((i) => i.h)).toEqual([
      "/design/elections.html",
      "/guide/a.html",
    ]);
    expect(parseDocsIndex({ nope: 1 })).toEqual([]);
  });
});

describe("docsItemsToCandidates", () => {
  it("links to the docs site and flags body matches", () => {
    const candidates = docsItemsToCandidates(parseDocsIndex(FIXTURE), "primaries");
    expect(candidates[1].href).toBe("https://docs.lakesidegames.net/guide/a.html");
    expect(candidates[1].kind).toBe("docs");
    expect(candidates[1].matchedBody).toBe(true);
    expect(candidates[0].matchedBody).toBe(false);
  });
});

describe("getDocsIndex", () => {
  beforeEach(() => resetDocsIndexCache());
  afterEach(() => vi.unstubAllGlobals());

  it("caches a successful fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(FIXTURE)));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getDocsIndex()).toHaveLength(2);
    expect(await getDocsIndex()).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns an empty list instead of throwing when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await getDocsIndex()).toEqual([]);
  });

  it("returns an empty list on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 500 })));
    expect(await getDocsIndex()).toEqual([]);
  });
});
