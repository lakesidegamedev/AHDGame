import { describe, expect, it } from "vitest";
import { MAIN_MODES, mainModesFor } from "./sharePurchaseModalTypes";

describe("mainModesFor", () => {
  it("offers the full trade dialog to a listed company", () => {
    expect(mainModesFor(false)).toEqual(MAIN_MODES);
  });

  it("drops the order book for a private company, which trades by private sale", () => {
    const modes = mainModesFor(true).map((mode) => mode.id);
    expect(modes).toEqual(["float", "private"]);
    expect(modes).not.toContain("limit");
    expect(modes).not.toContain("orderbook");
  });
});
