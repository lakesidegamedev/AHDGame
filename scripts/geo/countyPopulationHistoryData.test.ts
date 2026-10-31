import { describe, expect, it } from "vitest";
import {
  parseDecennialCounties,
  parseIntercensalCounties,
  parse1979Counties,
  reconcileCountyHistory,
} from "./countyPopulationHistoryData";
import { parseCountyPopulationDataset } from "./countyPopulationData";

describe("historical Census adapters", () => {
  it("selects the requested decennial column without treating absent observations as zero", () => {
    const text = "01001 9 8 7 6 5 4 3 2 1 0 AL Example\n01003 9 8 7 6 --- 4 3 2 1 0 AL New County";
    expect(parseDecennialCounties(text, 1950)).toEqual({ "01001": 5 });
    expect(parseDecennialCounties(text, 1900)["01001"]).toBe(0);
    expect(() => parseDecennialCounties(text + "\n" + text, 1950)).toThrow("Duplicate");
    expect(() => parseDecennialCounties(text, 1953)).toThrow();
  });
  it("selects the 1979 panel and joins wrapped county names", () => {
    expect(
      parse1979Counties(
        "Code  Area Name 1970 1971 1972 1973 1974\n01001 Example Co. 1 2 3 4 5\nCode  Area Name 1975 1976 1977 1978 1979\n01001 Example\nCounty 6 7 8 9 10\n01003 Other Co. 5 6 7 8 9"
      )
    ).toEqual({ "01001": 10, "01003": 9 });
    expect(() => parse1979Counties("Code  Area Name 1979\n01001 Broken name")).toThrow(
      "Incomplete"
    );
  });
  const cells = () =>
    Array.from(
      { length: 304 },
      (_, cell) =>
        `91 01001 ${Math.floor(cell / 16)} ${Math.floor((cell % 16) / 2) + 1} ${(cell % 2) + 1} 1`
    );
  it("sums exactly one complete, disjoint intercensal county roster", () => {
    expect(parseIntercensalCounties(cells().join("\n"), 1991)).toEqual({ "01001": 304 });
    expect(() => parseIntercensalCounties(cells().slice(1).join("\n"), 1991)).toThrow("Incomplete");
    expect(() => parseIntercensalCounties([...cells(), cells()[0]].join("\n"), 1991)).toThrow(
      "Duplicate"
    );
    expect(() => parseIntercensalCounties(cells().join("\n"), 1999)).toThrow("Invalid");
    expect(() => parseIntercensalCounties("91 01001 0 0 1 5", 1991)).toThrow("Invalid");
  });
  it("reads the named annual estimate rather than a later vintage's terminal year", () => {
    const csv =
      "SUMLEV,STATE,COUNTY,POPESTIMATE2007,POPESTIMATE2009\n040,01,000,5,10\n050,01,001,2,6\n050,01,003,3,4";
    expect(parseCountyPopulationDataset(csv, "POPESTIMATE2007").populations).toEqual({
      "01001": 2,
      "01003": 3,
    });
    expect(() => parseCountyPopulationDataset(csv)).toThrow("Missing");
  });
  it("reconciles whole-entity renames and mergers without allocating across a split", () => {
    expect(
      reconcileCountyHistory({ "12025": 5, "51019": 7, "51515": 3 }, ["12086", "51019"]).populations
    ).toEqual({ "12086": 5, "51019": 10 });
    const result = reconcileCountyHistory({ "01001": 2, "08001": 7 }, ["01001", "08001", "08014"]);
    expect(result.populations).toEqual({ "01001": 2 });
    expect(result.fallbackStates).toEqual({ "08": { missing: ["08014"], extra: [] } });
    expect(reconcileCountyHistory({ "01001": 2, "01999": 3 }, ["01001"]).populations).toEqual({});
    expect(() => reconcileCountyHistory({ "01001": -1 }, ["01001"])).toThrow("Invalid");
    expect(() => reconcileCountyHistory({ "12025": 1, "12086": 1 }, ["12086"])).toThrow(
      "Conflicting"
    );
    expect(() => reconcileCountyHistory({ "51515": 1 }, ["51019"])).toThrow("Incomplete");
    expect(() => reconcileCountyHistory({ "02063": 1 }, ["02261"])).toThrow("Incomplete");
    expect(reconcileCountyHistory({ "02063": 2, "02066": 3 }, ["02261"]).populations).toEqual({
      "02261": 5,
    });
  });
});
