import { describe, expect, it } from "vitest";
import { openingDistrictHolders } from "./openingHolders";

const districts = [1, 2, 3].map((n) => ({ id: `CA${n}`, state: "CA", lean: n, occupied: false }));
const officials = [
  { id: "d", state: "CA", party: "DEM", position: -2, seats: 2 },
  { id: "r", state: "CA", party: "GOP", position: 2, seats: 1 },
];
describe("opening House holders", () => {
  it("fills every district and preserves compressed delegation counts", () => {
    expect(
      openingDistrictHolders({ districts, officials }).map((a) => [a.districtId, a.party])
    ).toEqual([
      ["CA1", "DEM"],
      ["CA2", "DEM"],
      ["CA3", "GOP"],
    ]);
  });
  it("leaves founding vacancies and already occupied states alone", () => {
    expect(openingDistrictHolders({ districts, officials: [] })).toEqual([]);
    expect(
      openingDistrictHolders({
        districts: districts.map((d, i) => ({ ...d, occupied: i === 0 })),
        officials,
      })
    ).toEqual([]);
  });
  it("fails instead of inventing seats when the roster is incomplete", () => {
    expect(() => openingDistrictHolders({ districts, officials: officials.slice(0, 1) })).toThrow();
  });
});
