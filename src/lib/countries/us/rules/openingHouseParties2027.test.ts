import { expect, it } from "vitest";
import snapshot from "../data/us2026ResultsSnapshot.json";
import { US_CONGRESS_RESULT_2027, US_HOUSE_2027_RESULT } from "../data/usCongressResult2027";
import { openingHouseParties2027 } from "./openingHouseParties2027";

it("preserves called districts and matches every canonical state delegation", () => {
  const parties = openingHouseParties2027({
    districts: snapshot.house,
    delegations: US_HOUSE_2027_RESULT,
    uncalled: US_CONGRESS_RESULT_2027.house.uncalledSeats,
  });
  expect(parties.size).toBe(435);
  for (const row of US_HOUSE_2027_RESULT)
    expect(
      [...parties].filter(
        ([id, party]) =>
          id.startsWith(row.state + "-") && party === (row.party === "democrat" ? "DEM" : "REP")
      )
    ).toHaveLength(row.seatsHeld!);
  for (const row of snapshot.house)
    if (
      !US_CONGRESS_RESULT_2027.house.uncalledSeats.some(
        (id) => id === row.district.replace(/-0([1-9])$/, "-$1")
      )
    )
      expect(parties.get(row.district)).toBe(row.party === "D" ? "DEM" : "REP");
});

it("rejects a discrepancy in a called district rather than silently changing it", () => {
  expect(() =>
    openingHouseParties2027({
      districts: [{ district: "LA-01", party: "D" }],
      delegations: [{ state: "LA", party: "republican", seatsHeld: 1 }],
      uncalled: [],
    })
  ).toThrow("Called district conflicts");
});
