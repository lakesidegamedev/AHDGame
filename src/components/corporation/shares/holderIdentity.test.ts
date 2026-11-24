import { describe, expect, it } from "vitest";
import { holderIdentityTag } from "./holderIdentity";

describe("holderIdentityTag", () => {
  it("uses the character number for a player", () => {
    expect(holderIdentityTag({ characterId: "a1b2c3d4e5f6", sequentialId: 42 })).toBe("#42");
  });
  it("uses the id suffix for an NPP, which has no page", () => {
    expect(holderIdentityTag({ characterId: "a1b2c3d4e5f6", isNpp: true })).toBe("ref d4e5f6");
  });
  it("tags nothing for funds or corporations", () => {
    expect(holderIdentityTag({ characterId: "x", isFund: true })).toBeNull();
    expect(holderIdentityTag({ corporationId: "c1", sequentialId: 3 })).toBeNull();
  });
});
