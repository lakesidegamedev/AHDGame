import { describe, expect, it } from "vitest";
import { anchoredLeft, panelWidth } from "./DesktopMegaMenu";

describe("grouped cards panel placement", () => {
  it("sizes to its card columns, at most three, plus the side column", () => {
    expect(panelWidth(1)).toBe(520);
    expect(panelWidth(2)).toBe(752);
    expect(panelWidth(3)).toBe(1002);
    expect(panelWidth(6)).toBe(1002);
  });

  it("opens centred under its tab", () => {
    expect(anchoredLeft({ left: 600, width: 100 }, 400, 1600)).toBe(450);
  });

  it("stays on screen next to tabs near either edge", () => {
    expect(anchoredLeft({ left: 20, width: 80 }, 752, 1600)).toBe(16);
    expect(anchoredLeft({ left: 1500, width: 80 }, 752, 1600)).toBe(1600 - 752 - 16);
    expect(anchoredLeft({ left: 500, width: 80 }, 1200, 1100)).toBe(16);
  });
});
