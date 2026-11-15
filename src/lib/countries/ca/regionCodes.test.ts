import { expect, it } from "vitest";
import { displayCanadianRegionCode, canonicalCanadianPlayerUrl } from "./regionCodes";
import { canonicalRegionId, compactRegionCode } from "@/lib/constants/countriesCore";
import {
  regionUrl,
  regionPartyUrl,
  regionMetricUrl,
  electionRegionUrl,
  regionApiUrl,
} from "@/lib/urls";
import { caRegions2027 } from "./data/caRegions2027";

it.each(caRegions2027)("round-trips $_id without exposing its namespace", (region) => {
  const code = region._id.slice(3);
  expect(displayCanadianRegionCode(region._id)).toBe(code);
  expect(compactRegionCode("CA", region._id)).toBe(code);
  expect(canonicalRegionId("ca", code.toLowerCase())).toBe(region._id);
  expect(canonicalRegionId("CA", region._id)).toBe(region._id);
  expect(regionUrl("CA", region._id)).toBe(`/country/ca/region/${code}`);
  expect(regionPartyUrl("CA", region._id, "1")).toBe(`/country/ca/region/${code}/party/1`);
  expect(regionMetricUrl("CA", region._id, "health", "access")).not.toContain("CA_");
  expect(electionRegionUrl("race", "CA", region._id)).toBe(
    `/elections/race/country/ca/region/${code}`
  );
  expect(regionApiUrl("CA", region._id)).toBe(`/api/country/ca/region/${region._id}`);
});

it("keeps California, national Canada, foreign IDs and non-region identifiers separate", () => {
  for (const value of ["CA", "US", "HU_BUD", "CA-FED-2023-35001", "CA_party", "CA_ZZ"])
    expect(displayCanadianRegionCode(value)).toBe(value);
  expect(canonicalRegionId("US", "CA")).toBe("CA");
  expect(canonicalRegionId("US", "NT")).toBe("NT");
  expect(regionUrl("US", "CA")).toBe("/country/us/region/CA");
});

it.each([
  [
    "/country/ca/region/CA_NT?tab=politics&sub=elections",
    "/country/ca/region/NT?tab=politics&sub=elections",
  ],
  ["/country/ca/region/CA_ON/party/1", "/country/ca/region/ON/party/1"],
  ["/elections/race/country/ca/region/CA_QC", "/elections/race/country/ca/region/QC"],
  [
    "/country/ca/elections?state=CA_NT&type=governor",
    "/country/ca/elections?state=NT&type=governor",
  ],
  ["/campaign-manager?country=CA&region=CA_ON", "/campaign-manager?country=CA&region=ON"],
])("canonicalizes the old public link %s", (before, after) => {
  expect(canonicalCanadianPlayerUrl(`http://localhost${before}`)).toBe(`http://localhost${after}`);
  expect(canonicalCanadianPlayerUrl(`http://localhost${after}`)).toBeNull();
});

it.each([
  "/api/country/ca/region/CA_NT",
  "/country/us/region/CA",
  "/country/ca/region/NT",
  "/campaign-manager?country=US&region=CA_NT",
])("leaves internal or foreign links unchanged: %s", (path) => {
  expect(canonicalCanadianPlayerUrl(`http://localhost${path}`)).toBeNull();
});
