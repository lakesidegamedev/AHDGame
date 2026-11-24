import { describe, expect, it } from "vitest";
import { desktopNavigationLayout } from "./desktopNavigationLayout";
import { rankDesktopLinks } from "@/components/navbar/desktopNavModel";

describe("desktop navigation preferences", () => {
  it("gives every account grouped cards until they pick a layout", () => {
    expect(desktopNavigationLayout(undefined)).toBe("cards");
    expect(desktopNavigationLayout(null)).toBe("cards");
  });

  it("respects a saved standard layout", () => {
    expect(desktopNavigationLayout("standard")).toBe("standard");
  });

  it("preserves all explicit layout choices and safely handles old values", () => {
    for (const layout of ["cards", "standard"]) {
      expect(desktopNavigationLayout(layout)).toBe(layout);
    }
    // Retired layouts and junk read as grouped cards.
    for (const layout of ["browser", "directory", "unknown"]) {
      expect(desktopNavigationLayout(layout)).toBe("cards");
    }
  });

  it("keeps nested links beside their parent while prioritizing personal destinations", () => {
    const links = [
      { id: "crises", label: "Crises" },
      { id: "subsidiaryGroup", parentId: "myCorporation", label: "Group" },
      { id: "banking", label: "Banking" },
      { id: "germanQuestion", parentId: "crises", label: "Crisis" },
      { id: "myCorporation", label: "My company" },
    ];
    expect(rankDesktopLinks(links).map((link) => link.id)).toEqual([
      "myCorporation",
      "subsidiaryGroup",
      "banking",
      "crises",
      "germanQuestion",
    ]);
    expect(links[0].id).toBe("crises");
  });
});
