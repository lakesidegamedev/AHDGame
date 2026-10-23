import { afterEach, describe, expect, it, vi } from "vitest";
import { rewind, roundGeometry, simplifyArc } from "./geometry.mjs";
import { fetchSource } from "./sources.mjs";

describe("country-map geometry helpers", () => {
  it("pins arc endpoints and preserves country thresholds, including the strict boundary", () => {
    const arc = [
      [0, 0],
      [1, 1e-5],
      [2, 0],
    ];
    expect(simplifyArc(arc, 1.2e-5)).toEqual([arc[0], arc[2]]);
    expect(simplifyArc(arc, 4e-6)).toEqual(arc);
    expect(simplifyArc(arc, 1e-5)).toEqual(arc);
    expect(arc).toHaveLength(3);
    expect(
      simplifyArc(
        [
          [0, 0],
          [1, 0],
          [2, 0],
          [3, 0],
        ],
        1
      )
    ).toEqual([
      [0, 0],
      [3, 0],
    ]);
  });

  it.each([
    [],
    [[1, 2]],
    [
      [1, 2],
      [3, 4],
    ],
  ])("retains short-arc identity: %j", (...points) => {
    expect(simplifyArc(points, 1)).toBe(points);
  });

  it("winds polygon exteriors clockwise and holes counterclockwise without mutating input", () => {
    const clockwise = [
      [0, 0],
      [0, 2],
      [2, 2],
      [2, 0],
      [0, 0],
    ];
    const counterclockwise = clockwise.slice().reverse();
    const geometry = { type: "Polygon", coordinates: [counterclockwise, clockwise] };
    const before = structuredClone(geometry);
    const result = rewind(geometry);
    expect(result).toEqual({ type: "Polygon", coordinates: [clockwise, counterclockwise] });
    expect(geometry).toEqual(before);
    expect(rewind(result)).toEqual(result);
  });

  it("retains multipolygon shape and zero-area ring identity", () => {
    const ring = [
      [1, 1],
      [2, 2],
      [1, 1],
    ];
    const geometry = { type: "MultiPolygon", coordinates: [[ring], []] };
    expect(rewind(geometry)).toEqual(geometry);
    expect(rewind(geometry).coordinates[0][0]).toBe(ring);
    expect(rewind({ type: "MultiPolygon", coordinates: [] }).coordinates).toEqual([]);
  });

  it("uses the supplied rounding function and retains polygon nesting", () => {
    const geometry = { type: "Polygon", coordinates: [[[1.23456, -2.34567, 99]]] };
    const round = (value: number) => Math.round(value * 1e4) / 1e4;
    const expected = [[[1.2346, -2.3457]]];
    expect(roundGeometry(geometry, round)).toEqual({ type: "Polygon", coordinates: expected });
    expect(
      roundGeometry({ type: "MultiPolygon", coordinates: [geometry.coordinates] }, round)
    ).toEqual({ type: "MultiPolygon", coordinates: [expected] });
    expect(roundGeometry(geometry, Math.floor).coordinates).toEqual([[[1, -3]]]);
    expect(geometry.coordinates[0][0]).toEqual([1.23456, -2.34567, 99]);
  });
});

describe("country-map source fallback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("tries sources in order, follows metadata URLs and preserves mapping callbacks", async () => {
    const codeProp = (properties: { code: string }) => properties.code;
    const sources = [
      { name: "offline", url: "offline" },
      { name: "missing URL", url: "missing", indirect: true },
      { name: "empty", url: "empty" },
      { name: "invalid JSON", url: "invalid" },
      { name: "good", url: "meta", indirect: true, codeProp },
    ];
    const gj = { features: [{ properties: { code: "IT" } }] };
    const json = (value: unknown) => ({ json: async () => value });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ features: [] }))
      .mockResolvedValueOnce({
        json: async () => {
          throw new Error("invalid JSON");
        },
      })
      .mockResolvedValueOnce(json({ gjDownloadURL: "geometry" }))
      .mockResolvedValueOnce(json(gj));
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await fetchSource(sources);
    expect(result).toEqual({ ...sources[4], gj });
    expect(result.codeProp).toBe(codeProp);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "offline",
      "missing",
      "empty",
      "invalid",
      "meta",
      "geometry",
    ]);
    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      "source offline failed: offline",
      "source missing URL failed: no gjDownloadURL",
      "source empty failed: no features",
      "source invalid JSON failed: invalid JSON",
    ]);
  });

  it("returns the first direct source without fetching unused fallbacks", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ features: [{}] }) }));
    const result = await fetchSource([
      { name: "first", url: "first" },
      { name: "unused", url: "unused" },
    ]);
    expect(result.name).toBe("first");
    expect(fetch).toHaveBeenCalledExactlyOnceWith("first");
  });

  it("rejects when no source provides features", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ features: [] }) }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(fetchSource([{ name: "empty", url: "empty" }])).rejects.toThrow(
      "all sources failed"
    );
    await expect(fetchSource([])).rejects.toThrow("all sources failed");
  });
});
