import { describe, expect, it } from "vitest";
import { placeLabels } from "./CampaignMap";

const boxes: Record<string, readonly [number, number, number, number]> = {
  MD: [0, 0, 100, 40],
  DC: [40, 10, 50, 20],
  VA: [0, 200, 120, 260],
};

const opts = (first: string | null) => ({
  first,
  pxPerUnit: 1,
  view: { k: 1, x: 0, y: 0 },
  bbox: (id: string) => boxes[id],
  text: (id: string) => ({ MD: "Maryland", DC: "District of Columbia", VA: "Virginia" })[id]!,
  fontSize: 12,
});

describe("placeLabels", () => {
  it("drops a label that would print over a neighbour", () => {
    expect(placeLabels(["DC", "MD", "VA"], opts(null))).toEqual(["VA", "MD"]);
  });

  it("always keeps the selected region's label", () => {
    expect(placeLabels(["MD", "DC", "VA"], opts("DC"))).toEqual(["DC", "VA"]);
  });
});
