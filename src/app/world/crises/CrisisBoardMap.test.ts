import { describe, expect, it } from "vitest";
import { layoutHotspots } from "./CrisisBoardMap";

const centroids = new Map<string, [number, number]>([
  ["US", [100, 100]],
  ["FR", [300, 80]],
]);

describe("layoutHotspots", () => {
  it("places a lone crisis on its country and skips unplaceable ones", () => {
    const spots = layoutHotspots(
      [
        { id: "a", countryIds: ["US"] },
        { id: "b", countryIds: [] },
        { id: "c", countryIds: ["ZZ", "FR"] },
      ],
      centroids
    );
    expect(spots).toEqual([
      { id: "a", x: 100, y: 100 },
      { id: "c", x: 300, y: 80 },
    ]);
  });

  it("fans crises sharing a country onto distinct points", () => {
    const spots = layoutHotspots(
      [
        { id: "a", countryIds: ["US"] },
        { id: "b", countryIds: ["US"] },
      ],
      centroids
    );
    expect(spots).toHaveLength(2);
    expect(spots[0]).not.toEqual(spots[1]);
  });
});
