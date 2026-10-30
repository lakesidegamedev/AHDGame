import { describe, it, expect } from "vitest";
import { parseCountyPopulations, parseCountyPopulationDataset } from "./countyPopulationData";
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
  it("checks official state totals and accepts a BOM", () => {
    const csv =
      "\uFEFFSUMLEV,STATE,COUNTY,POPESTIMATE2019\r\n040,01,000,5\r\n050,01,001,2\r\n050,01,003,3\r\n";
    expect(parseCountyPopulationDataset(csv)).toEqual({
      populations: { "01001": 2, "01003": 3 },
      stateTotalsByFips: { "01": 5 },
    });
    expect(() => parseCountyPopulationDataset(csv.replace("000,5", "000,6"))).toThrow("mismatch");
    expect(() => parseCountyPopulationDataset(csv.replace("040,01,000,5\r\n", ""))).toThrow(
      "mismatch"
    );
  });
  it.each(["050,1,0001,5", "050,001,001,5", "050,01,000,5", "050,00,001,5"])(
    "rejects malformed split FIPS codes (%s)",
    (row) => {
      expect(() => parseCountyPopulations("SUMLEV,STATE,COUNTY,POPESTIMATE2019\n" + row)).toThrow();
    }
  );
  it.each(["0x10", "1e3", "1.0"])("rejects non-decimal population text (%s)", (text) => {
    expect(() =>
      parseCountyPopulations("SUMLEV,STATE,COUNTY,POPESTIMATE2019\n050,01,001," + text)
    ).toThrow();
  });
});
