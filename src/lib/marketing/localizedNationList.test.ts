import { describe, expect, it } from "vitest";
import { formatNationList, type MarketedNation } from "./marketedWorld";
import { formatNationListForLocale, localizedNationName } from "./localizedNationList";

const US: MarketedNation = { id: "US", name: "United States" };
const CA: MarketedNation = { id: "CA", name: "Canada" };
const UK: MarketedNation = { id: "UK", name: "United Kingdom" };
const SOVIET: MarketedNation = { id: "RU", name: "Soviet Union" };

describe("formatNationListForLocale", () => {
  it("writes the 2027 player countries in German with German names and conjunction", () => {
    expect(formatNationListForLocale([US, CA], "de")).toBe("Vereinigte Staaten und Kanada");
  });

  it("matches the existing English formatter in English", () => {
    for (const list of [[US], [US, CA], [US, CA, UK]]) {
      expect(formatNationListForLocale(list, "en")).toBe(formatNationList(list));
    }
  });

  it("maps the game's UK id to the ISO region", () => {
    expect(localizedNationName(UK, "de")).toBe("Vereinigtes Königreich");
  });

  it("keeps an era name instead of translating it into the modern state", () => {
    expect(localizedNationName(SOVIET, "de")).toBe("Soviet Union");
  });

  it("supports an either-or list", () => {
    expect(formatNationListForLocale([US, CA], "de", "disjunction")).toBe(
      "Vereinigte Staaten oder Kanada"
    );
  });
});
