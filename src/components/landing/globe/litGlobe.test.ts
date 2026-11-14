import { describe, expect, it } from "vitest";
import type { Topology } from "topojson-specification";
import { buildScene, cityLightLevel, nightShade, retintScene } from "./litGlobe";

/** Two unit squares sharing one edge: one border, six coast edges. */
const topology = {
  type: "Topology",
  arcs: [
    [
      [0, 0],
      [0, 10],
      [10, 0],
      [0, -10],
      [-10, 0],
    ],
    [
      [10, 0],
      [0, 10],
      [10, 0],
      [0, -10],
      [-10, 0],
    ],
    [
      [10, 0],
      [0, 10],
    ],
  ],
  objects: {
    countries: {
      type: "GeometryCollection",
      geometries: [
        { type: "Polygon", id: "1", arcs: [[0]] },
        { type: "Polygon", id: "2", arcs: [[1]] },
      ],
    },
  },
} as unknown as Topology;

describe("nightShade", () => {
  it("is clear in full day at the centre and opaque-ish in full night", () => {
    expect(nightShade(1, 1)[3]).toBe(0);
    expect(nightShade(-1, 1)[3]).toBeGreaterThan(180);
  });

  it("darkens steadily through twilight, with no step", () => {
    let last = -1;
    for (let c = 0.15; c >= -0.4; c -= 0.05) {
      const alpha = nightShade(c, 1)[3];
      expect(alpha).toBeGreaterThanOrEqual(last);
      expect(alpha - last).toBeLessThan(60);
      last = alpha;
    }
  });

  it("darkens toward the limb", () => {
    expect(nightShade(1, 0.1)[3]).toBeGreaterThan(nightShade(1, 1)[3]);
  });
});

describe("cityLightLevel", () => {
  it("is off in daylight, full at night and fades through twilight", () => {
    expect(cityLightLevel(0.5)).toBe(0);
    expect(cityLightLevel(-0.5)).toBe(1);
    const mid = cityLightLevel(-0.12);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});

describe("buildScene", () => {
  it("builds one feature per country and separates borders from coasts", () => {
    const scene = buildScene(topology, (id) => (id === "1" ? "player" : "background"));
    expect(scene.land.map((l) => [l.id, l.kind])).toEqual([
      ["1", "player"],
      ["2", "background"],
    ]);
    expect(scene.borders.type).toBe("MultiLineString");
    expect(scene.coast.type).toBe("MultiLineString");
  });

  it("re-tints without rebuilding", () => {
    const scene = buildScene(topology, () => "background");
    retintScene(scene, () => "economic");
    expect(scene.land.every((l) => l.kind === "economic")).toBe(true);
  });
});
