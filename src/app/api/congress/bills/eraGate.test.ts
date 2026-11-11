import { describe, expect, it } from "vitest";
import { isLegislationTypeActive } from "@/lib/era/legislationCatalog";

// The route gate is a thin wrapper over the resolver; this test pins the
// contract the route relies on (full end-to-end route tests need a DB harness).
describe("congress bill era gate contract", () => {
  it("rejects a windowed type before its window, accepts at/after, accepts when year null", () => {
    expect(isLegislationTypeActive("ie_cybersecurity", 1997)).toBe(false);
    expect(isLegislationTypeActive("ie_cybersecurity", 1998)).toBe(true);
    expect(isLegislationTypeActive("ie_cybersecurity", null)).toBe(true);
  });
});
