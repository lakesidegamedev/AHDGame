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
    expect(parseWidgetKey("dueSoon")).toEqual({ id: "dueSoon", param: null });
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
      "dueSoon:1",
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

  it("offers role widgets only to the players they apply to", () => {
    expect(parseWidgetKey("myRace")).toEqual({ id: "myRace", param: null });
    expect(parseWidgetKey("chamberFloor:house")).toBeNull();
    const saved = { tray: ["myRace", "chamberFloor", "officeDashboard", "sinceAway"], nav: {} };
    expect(effectiveWidgetLayout(saved, player).tray).toEqual(["sinceAway"]);
    expect(
      effectiveWidgetLayout(saved, {
        ...player,
        isCandidate: true,
        isLegislator: true,
        holdsOffice: true,
      }).tray
    ).toEqual(saved.tray);
  });

  it("starts candidates with their race and office holders with their office", () => {
    expect(defaultWidgetLayout({ ...player, isCandidate: true }).tray).toEqual([
      "keirPet",
      "dueSoon",
      "myRace",
      "stockTicker:home",
      "commodityBoard",
    ]);
    expect(defaultWidgetLayout({ ...ceoStaff, holdsOffice: true, isCandidate: true }).tray).toEqual(
      [
        "keirPet",
        "dueSoon",
        "officeDashboard",
        "myRace",
        "myCompany",
        "stockTicker:home",
        "staffQueues",
      ]
    );
    // A seat alone adds nothing by default; the floor widget is opt-in.
    expect(defaultWidgetLayout({ ...player, isLegislator: true }).tray).toEqual([
      "keirPet",
      "dueSoon",
      "stockTicker:home",
      "commodityBoard",
    ]);
  });

  it("starts company runners and staff with their widgets", () => {
    // Players without a company get commodity prices instead.
    expect(defaultWidgetLayout(player).tray).toEqual([
      "keirPet",
      "dueSoon",
      "stockTicker:home",
      "commodityBoard",
    ]);
    expect(defaultWidgetLayout(ceoStaff)).toEqual({
      tray: ["keirPet", "dueSoon", "myCompany", "stockTicker:home", "staffQueues"],
      nav: { world: "stockTicker:global", staff: "staffQueues" },
    });
  });
});
