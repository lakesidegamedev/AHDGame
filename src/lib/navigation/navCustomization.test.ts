import { describe, expect, it } from "vitest";
import {
  applySavedOrder,
  MAX_NAV_PINS,
  moveItem,
  navCustomization,
  togglePin,
} from "./navCustomization";

describe("navCustomization", () => {
  it("drops malformed ids, duplicates and extra pins", () => {
    const parsed = navCustomization({
      pinned: [
        "world:stockMarket",
        "world:stockMarket",
        "bad id",
        4,
        "a:1",
        "a:2",
        "a:3",
        "a:4",
        "a:5",
      ],
      order: { "world:markets": ["forex", "trade"], "bad key": ["x"], "world:empty": [] },
    });
    expect(parsed.pinned).toEqual(["world:stockMarket", "a:1", "a:2", "a:3", "a:4"]);
    expect(parsed.pinned).toHaveLength(MAX_NAV_PINS);
    expect(parsed.order).toEqual({ "world:markets": ["forex", "trade"] });
  });

  it("treats anything that is not an object as empty", () => {
    expect(navCustomization(null)).toEqual({ pinned: [], order: {} });
    expect(navCustomization("x")).toEqual({ pinned: [], order: {} });
  });
});

describe("applySavedOrder", () => {
  const items = [
    { id: "stockMarket" },
    { id: "banking" },
    { id: "centralBank", parentId: "banking" },
    { id: "forex" },
  ];

  it("keeps the default order without a saved list", () => {
    expect(applySavedOrder(items, undefined)).toBe(items);
  });

  it("puts saved ids first, keeps children under their parent, and appends unknown items", () => {
    expect(applySavedOrder(items, ["forex", "banking", "gone"]).map((item) => item.id)).toEqual([
      "forex",
      "banking",
      "centralBank",
      "stockMarket",
    ]);
  });
});

describe("pins and moves", () => {
  it("toggles a pin on and off", () => {
    const on = togglePin({ pinned: [], order: {} }, "help:about");
    expect(on.pinned).toEqual(["help:about"]);
    expect(togglePin(on, "help:about").pinned).toEqual([]);
  });

  it("moves an item and clamps the target", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, -5)).toEqual(["c", "a", "b"]);
    const list = ["a"];
    expect(moveItem(list, 0, 0)).toBe(list);
  });
});
