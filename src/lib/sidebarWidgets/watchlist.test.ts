import { describe, expect, it } from "vitest";
import { isWatchItem, MAX_WATCHLIST, widgetWatchlist } from "./watchlist";

describe("widgetWatchlist", () => {
  it("returns an empty list for missing or malformed values", () => {
    expect(widgetWatchlist(undefined)).toEqual([]);
    expect(widgetWatchlist({ kind: "commodity", id: "oil" })).toEqual([]);
  });

  it("keeps valid items in order and drops repeats, unknown kinds and bad ids", () => {
    expect(
      widgetWatchlist([
        { kind: "corporation", id: "12" },
        { kind: "commodity", id: "oil" },
        { kind: "corporation", id: "12" },
        { kind: "commodity", id: "unobtainium" },
        { kind: "corporation", id: "012" },
        { kind: "corporation", id: "abc" },
        { kind: "bill", id: "3" },
        { kind: "commodity", id: "steel", extra: true },
        "oil",
      ])
    ).toEqual([
      { kind: "corporation", id: "12" },
      { kind: "commodity", id: "oil" },
      { kind: "commodity", id: "steel" },
    ]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ kind: "corporation", id: String(i + 1) }));
    expect(widgetWatchlist(many)).toHaveLength(MAX_WATCHLIST);
  });

  it("checks commodities against the catalogue", () => {
    expect(isWatchItem({ kind: "commodity", id: "natural_gas" })).toBe(true);
    expect(isWatchItem({ kind: "commodity", id: "gold" })).toBe(false);
  });
});
