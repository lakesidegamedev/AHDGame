import { describe, expect, it } from "vitest";
import { desktopNavigationLayout, experimentalDesktopLayout } from "./desktopNavigationLayout";
import { rankDesktopLinks } from "@/components/navbar/desktopNavModel";

describe("desktop navigation preferences", () => {
  it("defaults opted-in accounts to cards and requires explicit experimental opt-in", () => {
    expect(experimentalDesktopLayout(true, undefined)).toBe("cards");
    for (const enabled of [false, undefined, "true"]) {
      expect(experimentalDesktopLayout(enabled, "browser")).toBeNull();
    }
  });

  it("preserves all explicit layout choices and safely handles old values", () => {
    for (const layout of ["cards", "browser", "directory", "standard"]) {
      expect(desktopNavigationLayout(layout)).toBe(layout);
    }
    expect(desktopNavigationLayout("unknown")).toBe("cards");
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
