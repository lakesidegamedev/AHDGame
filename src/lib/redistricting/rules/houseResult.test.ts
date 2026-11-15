import { describe, expect, it } from "vitest";
import { freezeHouseDistrictResult } from "./houseResult";

describe("frozen district results", () => {
  const input = {
    electionId: "race",
    countryId: "US",
    stateId: "MT",
    indices: [1, 2],
    assignment: new Map([
      [1, "a"],
      [2, "b"],
    ]),
    candidateParty: { a: "1", b: "2" },
    geometry: null,
  };
  it("records winners but labels incompatible or missing geometry unavailable", () => {
    const receipt = freezeHouseDistrictResult({
      ...input,
      geometry: { viewBox: "0 0 1 1", subdivisions: [{ id: "MT-AL", path: "old path" }] },
    });
    expect(receipt.geometryAvailable).toBe(false);
    expect(receipt.districts.map((d) => d.winner)).toEqual(["a", "b"]);
    expect(receipt.districts.every((d) => d.path === "" && d.leanStatus === "unavailable")).toBe(
      true
    );
  });
  it("refuses incomplete winner assignments", () => {
    expect(() => freezeHouseDistrictResult({ ...input, assignment: new Map([[1, "a"]]) })).toThrow(
      "Incomplete"
    );
  });
});
