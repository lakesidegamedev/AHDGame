import { describe, expect, it } from "vitest";
import { assessCountryReadiness, CAPABILITY_INVENTORY } from "@/lib/world/countryReadinessContract";
import { countriesPages } from "@/lib/seeds/wiki/pages/countries";
import { CA_MODERN_PACK } from "./eventsModern";
import { CA_CONFIG } from "./institutionsFacts";

/** The readiness inventory's flavor claims for Canada, checked against the content. */
describe("Canada 2027 flavor content", () => {
  it("backs the event claim with a Canada-only pack", () => {
    expect(CAPABILITY_INVENTORY["2027-default:CA:bespokeEvents"]?.present).toBe(true);
    expect(CA_MODERN_PACK.length).toBeGreaterThanOrEqual(3);
    for (const event of CA_MODERN_PACK) {
      expect(event.kind.startsWith("pree.ca.")).toBe(true);
      expect(event.requiresCountryIds).toEqual(["CA"]);
    }
  });

  it("backs the art claim with hero images", () => {
    expect(CAPABILITY_INVENTORY["2027-default:CA:artAssets"]?.present).toBe(true);
    expect(CA_CONFIG.centralBank?.heroImage ?? "").toContain("bank-of-canada");
  });

  it("backs the wiki claim with the Canada page", () => {
    expect(CAPABILITY_INVENTORY["2027-default:CA:wikiMaterial"]?.present).toBe(true);
    expect(countriesPages.some((p) => p.slug === "ca-overview")).toBe(true);
  });

  it("leaves Canada with no content gaps in 2027", () => {
    const report = assessCountryReadiness("CA", "2027-default");
    expect(report.player).toBe("ready");
    expect(report.flavorGaps).toEqual([]);
    expect(report.contentStatus).toBe("complete");
  });
});
