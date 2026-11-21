import { describe, it, expect } from "vitest";
import { getPartyRoleLabel } from "./partyRoleLabels";

describe("getPartyRoleLabel", () => {
  it("keeps the treasurer role distinct from another office's standard title", () => {
    const titles = { treasurer: " national VICE chair " };
    expect(getPartyRoleLabel("US", "treasurer", titles)).toBe("National Treasurer");
    expect(getPartyRoleLabel("US", "viceChair", titles)).toBe("National Vice Chair");
  });

  it("uses standard labels when two saved custom titles match", () => {
    const titles = { chair: "Coordinator", viceChair: "coordinator", treasurer: "Finance Lead" };
    expect(getPartyRoleLabel("US", "chair", titles)).toBe("National Chair");
    expect(getPartyRoleLabel("US", "viceChair", titles)).toBe("National Vice Chair");
    expect(getPartyRoleLabel("US", "treasurer", titles)).toBe("Finance Lead");
  });

  it("returns the default English label for a country with no overrides (US)", () => {
    expect(getPartyRoleLabel("US", "chair")).toBe("National Chair");
    expect(getPartyRoleLabel("US", "viceChair")).toBe("National Vice Chair");
    expect(getPartyRoleLabel("US", "treasurer")).toBe("National Treasurer");
    expect(getPartyRoleLabel("US", "committee")).toBe("National Committee");
  });

  it("returns CN overrides for chair/viceChair/committee", () => {
    expect(getPartyRoleLabel("CN", "chair")).toBe("General Secretary");
    expect(getPartyRoleLabel("CN", "viceChair")).toBe("Deputy General Secretary");
    expect(getPartyRoleLabel("CN", "committee")).toBe("Secretariat");
  });

  it("falls back to default for CN keys with no override (treasurer)", () => {
    expect(getPartyRoleLabel("CN", "treasurer")).toBe("National Treasurer");
  });

  it("is case-insensitive on the country id (route [code] is lowercase)", () => {
    expect(getPartyRoleLabel("cn", "chair")).toBe("General Secretary");
    expect(getPartyRoleLabel("us", "chair")).toBe("National Chair");
  });

  it("falls back to default labels for an unknown country id", () => {
    expect(getPartyRoleLabel("ZZ", "chair")).toBe("National Chair");
    expect(getPartyRoleLabel("", "committee")).toBe("National Committee");
  });

  it("uses a party title override and trims it", () => {
    expect(getPartyRoleLabel("US", "chair", { chair: "  General Secretary  " })).toBe(
      "General Secretary"
    );
    expect(getPartyRoleLabel("CN", "chair", { chair: "Party Chair" })).toBe("Party Chair");
  });

  it("falls back to the country title when a party override is empty or cleared", () => {
    expect(getPartyRoleLabel("CN", "chair", { chair: "  " })).toBe("General Secretary");
    expect(getPartyRoleLabel("CN", "viceChair", { viceChair: null })).toBe(
      "Deputy General Secretary"
    );
  });
});
