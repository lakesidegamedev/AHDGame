import { describe, expect, it } from "vitest";
import { soeSizeCost, soeSizeCostByCorpId } from "./soeSizeCost";

describe("soeSizeCost", () => {
  it("is zero when off", () => {
    expect(
      soeSizeCost({
        stateSectorCount: 80,
        statePlantCount: 800,
        overheadPpPerDoubling: 0.5,
        scale: 0,
      })
    ).toEqual({ overheadPp: 0, sprawlPp: 0 });
  });

  it("grows with the state's sector and plant counts", () => {
    const at = (sectors: number, plants: number) =>
      soeSizeCost({
        stateSectorCount: sectors,
        statePlantCount: plants,
        overheadPpPerDoubling: 0.5,
        scale: 1,
      });
    expect(at(60, 800).sprawlPp).toBeLessThan(at(30, 800).sprawlPp);
    expect(at(30, 1600).overheadPp).toBeGreaterThan(at(30, 200).overheadPp);
    expect(at(5, 1).sprawlPp).toBe(0);
  });

  it("phases in linearly with the scale", () => {
    const full = soeSizeCost({
      stateSectorCount: 60,
      statePlantCount: 800,
      overheadPpPerDoubling: 0.5,
      scale: 1,
    });
    const half = soeSizeCost({
      stateSectorCount: 60,
      statePlantCount: 800,
      overheadPpPerDoubling: 0.5,
      scale: 0.5,
    });
    expect(half.sprawlPp).toBeCloseTo(full.sprawlPp / 2, 10);
    expect(half.overheadPp).toBeCloseTo(full.overheadPp / 2, 10);
  });

  it("sums a country's National Corporations so splitting one does not dodge it", () => {
    const one = soeSizeCostByCorpId({
      corps: [{ id: "a", country: "US", sectorCount: 40, plantCount: 400 }],
      overheadPpPerDoubling: 0.5,
      scale: 1,
    });
    const split = soeSizeCostByCorpId({
      corps: [
        { id: "a", country: "US", sectorCount: 20, plantCount: 200 },
        { id: "b", country: "US", sectorCount: 20, plantCount: 200 },
        { id: "c", country: "GB", sectorCount: 5, plantCount: 50 },
      ],
      overheadPpPerDoubling: 0.5,
      scale: 1,
    });
    expect(split.get("a")).toEqual(one.get("a"));
    expect(split.get("b")).toEqual(one.get("a"));
    expect(split.get("c")!.sprawlPp).toBe(0);
  });
});
