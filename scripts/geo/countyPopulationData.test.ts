import { describe, it, expect } from "vitest";
import { parseCountyPopulations } from "./countyPopulationData";
describe("Census county population parser", () => {
  it("uses named population columns, preserves FIPS and handles quoted commas", () => {
    expect(
      parseCountyPopulations(
        'CTYNAME,STATE,COUNTY,SUMLEV,DENSITY,POPESTIMATE2019\r\n"County, city",36,061,050,49175,1628706\r\nState,36,000,040,0,19000000\r\n'
      )
    ).toEqual({ "36061": 1628706 });
  });
  it.each([
    "SUMLEV,STATE,COUNTY\n050,36,061",
    "SUMLEV,STATE,COUNTY,POPESTIMATE2019\n050,36,061,NaN",
    "SUMLEV,STATE,COUNTY,POPESTIMATE2019\n050,36,061,0",
    "SUMLEV,STATE,COUNTY,POPESTIMATE2019\n050,36,061,4\n050,36,061,5",
  ])("rejects invalid input instead of inventing population", (csv) => {
    expect(() => parseCountyPopulations(csv)).toThrow();
  });
});
