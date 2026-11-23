import { describe, expect, it } from "vitest";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import {
  PRIVATE_PAGE_CACHE_CONTROL,
  STATIC_PUBLIC_ASSET_CACHE_CONTROL,
  STATIC_PUBLIC_ASSET_SOURCE,
} from "./cacheHeaders";

describe("PRIVATE_PAGE_CACHE_CONTROL", () => {
  it("is never eligible for browser or shared-cache storage", () => {
    expect(PRIVATE_PAGE_CACHE_CONTROL).toContain("private");
    expect(PRIVATE_PAGE_CACHE_CONTROL).toContain("no-store");
    expect(PRIVATE_PAGE_CACHE_CONTROL).toContain("max-age=0");
    expect(PRIVATE_PAGE_CACHE_CONTROL).not.toContain("public");
    expect(PRIVATE_PAGE_CACHE_CONTROL).not.toContain("s-maxage");
  });

  it("allows origin compression without changing cache eligibility", () => {
    expect(PRIVATE_PAGE_CACHE_CONTROL).not.toContain("no-transform");
  });
});

describe("STATIC_PUBLIC_ASSET_SOURCE", () => {
  const matches = getPathMatch(STATIC_PUBLIC_ASSET_SOURCE);

  it("matches files served from public/", () => {
    for (const path of [
      "/ask/keir-M.webp",
      "/ahd-logo-80.webp",
      "/lakeside-mark.svg",
      "/us-states-10m.json",
      "/icons/vote.png",
      "/fonts/display.woff2",
    ]) {
      expect(matches(path), path).not.toBe(false);
    }
  });

  it("never matches pages, API routes, build output or the CDN proxy", () => {
    for (const path of [
      "/character/58",
      "/market",
      "/api/public/v1/openapi.json",
      "/api/uploads/avatar.png",
      "/_next/static/media/font.woff2",
      "/cdn/static/logo.png",
    ]) {
      expect(matches(path), path).toBe(false);
    }
  });

  it("is public and revalidates rather than caching forever", () => {
    expect(STATIC_PUBLIC_ASSET_CACHE_CONTROL).toContain("public");
    expect(STATIC_PUBLIC_ASSET_CACHE_CONTROL).not.toContain("immutable");
  });
});
