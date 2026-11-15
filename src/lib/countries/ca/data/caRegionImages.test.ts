import { describe, expect, it } from "vitest";
import { getCARegionImage } from "./caRegionImages";
import { resolveRegionBannerImage } from "@/lib/constants/regionBanner";
import { getStateDescriptor } from "@/lib/constants";
import { getLoginImage } from "@/lib/images/staticCdnAssets";

const CODES = ["ON", "QC", "BC", "AB", "MB", "SK", "NS", "NB", "NL", "PE", "YT", "NT", "NU"];

describe("Canadian region images", () => {
  it("gives every province and territory its own image under either id form", () => {
    const urls = CODES.map((c) => getCARegionImage(`CA_${c}`));
    expect(new Set(urls).size).toBe(CODES.length);
    for (const c of CODES) expect(getCARegionImage(c)).toBe(getCARegionImage(`CA_${c}`));
  });

  it("is wired into the region banner resolver", () => {
    expect(resolveRegionBannerImage("CA", "CA_NU")).toBe(getCARegionImage("NU"));
  });

  it("calls the territories territories", () => {
    for (const t of ["CA_YT", "CA_NT", "CA_NU"])
      expect(getStateDescriptor(t, "Province")).toBe("The Territory of");
    expect(getStateDescriptor("CA_ON", "Province")).toBe("The Province of");
  });

  it("has a 2027 login hero", () => {
    expect(getLoginImage(2027)).toMatch(/login-2027\.webp$/);
  });
});
