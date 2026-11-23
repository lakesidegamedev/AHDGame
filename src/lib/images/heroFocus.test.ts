import { describe, expect, it } from "vitest";
import { heroObjectPosition } from "./heroFocus";

describe("heroObjectPosition", () => {
  it("returns the focus point for a listed hero", () => {
    expect(heroObjectPosition("/api/images/hero/us-overview-mount-rushmore")).toBe("center 35%");
  });

  it("centres anything else", () => {
    expect(heroObjectPosition("/api/images/hero/white-house")).toBe("center");
    expect(heroObjectPosition("https://example.org/x.jpg")).toBe("center");
    expect(heroObjectPosition(null)).toBe("center");
  });
});
