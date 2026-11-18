import { describe, expect, it } from "vitest";
import { compareShareParam, parseCompareShareParam } from "./countryCompare";

const allowed = new Set(["FR", "JP", "BR", "US"]);

describe("compareShareParam", () => {
  it("writes both picks in panel order", () => {
    expect(compareShareParam(["FR", "JP"])).toBe("FR,JP");
    expect(compareShareParam(["JP", "FR"])).toBe("JP,FR");
  });

  it("never writes more than two", () => {
    expect(compareShareParam(["FR", "JP", "BR"])).toBe("FR,JP");
  });

  it("writes nothing for an empty selection", () => {
    expect(compareShareParam([])).toBe("");
  });
});

describe("parseCompareShareParam", () => {
  it("reads a pair back in order", () => {
    expect(parseCompareShareParam("FR,JP", allowed)).toEqual(["FR", "JP"]);
  });

  it("returns nothing for an absent or empty value", () => {
    expect(parseCompareShareParam(null, allowed)).toEqual([]);
    expect(parseCompareShareParam("", allowed)).toEqual([]);
    expect(parseCompareShareParam(" , ", allowed)).toEqual([]);
  });

  it("drops countries this world does not know", () => {
    expect(parseCompareShareParam("FR,ZZ,JP", allowed)).toEqual(["FR", "JP"]);
    expect(parseCompareShareParam("ZZ", allowed)).toEqual([]);
  });

  it("drops duplicates", () => {
    expect(parseCompareShareParam("FR,FR,JP", allowed)).toEqual(["FR", "JP"]);
  });

  it("stops at two even from a longer link", () => {
    expect(parseCompareShareParam("US,BR,FR,JP", allowed)).toEqual(["US", "BR"]);
  });

  it("trims whitespace a mail client may have added", () => {
    expect(parseCompareShareParam(" FR , JP ", allowed)).toEqual(["FR", "JP"]);
  });

  it("round trips the serializer", () => {
    const picked = ["BR", "US"];
    expect(parseCompareShareParam(compareShareParam(picked), allowed)).toEqual(picked);
  });

  it("opens a one sided link with just that side", () => {
    expect(parseCompareShareParam("FR", allowed)).toEqual(["FR"]);
  });
});
