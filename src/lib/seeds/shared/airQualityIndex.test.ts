import { describe, expect, it } from "vitest";
import { airQualityIndexFromPm25 } from "./airQualityIndex";

describe("shared air quality index", () => {
  it("maps PM2.5 onto one scale for every country", () => {
    expect(airQualityIndexFromPm25(2)).toBe(100);
    expect(airQualityIndexFromPm25(5)).toBe(82);
    expect(airQualityIndexFromPm25(7.5)).toBe(67);
    expect(airQualityIndexFromPm25(30)).toBe(0);
  });
});
