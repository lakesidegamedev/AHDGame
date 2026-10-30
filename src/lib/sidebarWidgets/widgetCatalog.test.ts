import { describe, expect, it } from "vitest";
import {
  defaultWidgetLayout,
  effectiveWidgetLayout,
  MAX_TRAY_WIDGETS,
  parseWidgetKey,
  widgetLayout,
} from "./widgetCatalog";

const player = { hasCorporation: false, isStaff: false };
const ceoStaff = { hasCorporation: true, isStaff: true };

describe("sidebar widget keys", () => {
  it("accepts known widgets and the parameters they take", () => {
    expect(parseWidgetKey("myCompany")).toEqual({ id: "myCompany", param: null });
    expect(parseWidgetKey("stockTicker:nyse")).toEqual({ id: "stockTicker", param: "nyse" });
    expect(parseWidgetKey("stockTicker:gosplan-bssr")?.param).toBe("gosplan-bssr");
    expect(parseWidgetKey("sectorHeatmap:home")).toEqual({ id: "sectorHeatmap", param: "home" });
    expect(parseWidgetKey("netWorth")).toEqual({ id: "netWorth", param: null });
    expect(parseWidgetKey("commodityBoard")).toEqual({ id: "commodityBoard", param: null });
  });

  it("rejects unknown widgets, missing parameters and unexpected ones", () => {
    for (const key of [
      "",
      "nope",
      "stockTicker",
      "myCompany:7",
      "stockTicker:NYSE",
      "a b",
      "sectorHeatmap",
      "netWorth:global",
    ]) {
      expect(parseWidgetKey(key)).toBeNull();
    }
  });
});

describe("widget layouts", () => {
  it("returns null for players who never customised, so role defaults apply", () => {
    expect(widgetLayout(undefined)).toBeNull();
    expect(effectiveWidgetLayout(undefined, ceoStaff)).toEqual(defaultWidgetLayout(ceoStaff));
  });

  it("cleans unknown keys, duplicates and menus, and caps the tray", () => {
    const many = Array.from({ length: 20 }, (_, i) => `stockTicker:x${i}`);
    const layout = widgetLayout({
      tray: ["myCompany", "myCompany", "bogus", ...many],
      nav: { world: "stockTicker:global", sidebar: "myCompany", help: "bogus" },
    });
    expect(layout?.tray[0]).toBe("myCompany");
    expect(layout?.tray).toHaveLength(MAX_TRAY_WIDGETS);
    expect(layout?.nav).toEqual({ world: "stockTicker:global" });
  });

  it("drops widgets the player can no longer use", () => {
    const saved = {
      tray: ["myCompany", "staffQueues", "stockTicker:global"],
      nav: { staff: "staffQueues" },
    };
    expect(effectiveWidgetLayout(saved, player)).toEqual({ tray: ["stockTicker:global"], nav: {} });
  });

  it("starts company runners and staff with their widgets, and others with commodities", () => {
    expect(defaultWidgetLayout(player).tray).toEqual(["stockTicker:home", "commodityBoard"]);
    expect(defaultWidgetLayout(ceoStaff)).toEqual({
      tray: ["myCompany", "stockTicker:home", "staffQueues"],
      nav: { world: "stockTicker:global", staff: "staffQueues" },
    });
  });
});
