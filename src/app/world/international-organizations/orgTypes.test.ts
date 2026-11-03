import { describe, expect, it } from "vitest";
import { actingCountryOf, homeCountryOf, type OrgViewerInfo } from "./orgTypes";

const viewer = (foreignMinisterOf: string | null, headOfGovernmentOf: string | null) =>
  ({ foreignMinisterOf, headOfGovernmentOf }) as unknown as OrgViewerInfo;

describe("organisation viewer country", () => {
  it("acts only for the foreign-affairs seat, matching the server", () => {
    expect(actingCountryOf(viewer("DE", null))).toBe("DE");
    expect(actingCountryOf(viewer(null, "DE"))).toBeNull();
    expect(actingCountryOf(null)).toBeNull();
  });

  it("still shows a head of government their own country read-only", () => {
    expect(homeCountryOf(viewer(null, "DE"))).toBe("DE");
    expect(homeCountryOf(viewer("FR", "DE"))).toBe("FR");
  });
});
