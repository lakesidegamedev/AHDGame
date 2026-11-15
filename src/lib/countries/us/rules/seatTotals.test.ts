import { expect, it } from "vitest";
import { US_2027 } from "../eras/2027";
import { US_CONFIG } from "../institutionsFacts";
import { states2027 } from "../data/usStates2027";
import { getCountryConfig } from "@/lib/constants/countries";
it("matches the 2027 regional register without changing historical capacity", () => {
  expect(states2027.reduce((sum, state) => sum + state.stateSenateSeats, 0)).toBe(1973);
  expect(US_2027.config?.subNationalChamber?.seats).toBe(1973);
  expect(US_CONFIG.subNationalChamber?.seats).toBe(1972);
  expect(getCountryConfig("US", "2027-default").subNationalChamber?.seats).toBe(1973);
  expect(getCountryConfig("US", "1991-default").subNationalChamber?.seats).toBe(1972);
  expect(getCountryConfig("US", "2019-default").subNationalChamber?.seats).toBe(1972);
});
