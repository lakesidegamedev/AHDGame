import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  LEGACY_COUNTRY_ROOTS,
  countryScopedUrl,
  legacyCountryRootRedirects,
} from "./countryRedirect";

describe("countryScopedUrl", () => {
  it("defaults to the United States when no country is given", () => {
    expect(countryScopedUrl("politicians")).toBe("/country/us/politicians");
    expect(countryScopedUrl("politicians", {})).toBe("/country/us/politicians");
    expect(countryScopedUrl("politicians", { country: "" })).toBe("/country/us/politicians");
  });

  it("lower-cases the requested country and keeps the destination path", () => {
    expect(countryScopedUrl("politicians", { country: "UK" })).toBe("/country/uk/politicians");
    expect(countryScopedUrl("parties/coalition/abc", { country: "IE" })).toBe(
      "/country/ie/parties/coalition/abc"
    );
  });

  it("uses the first value when the query parameter is repeated", () => {
    expect(countryScopedUrl("budget", { country: ["JP", "US"] })).toBe("/country/jp/budget");
  });
});

describe("legacyCountryRootRedirects", () => {
  it("covers every legacy root page that redirects in the browser", () => {
    const pageFor = (path: string) =>
      join(process.cwd(), "src/app", path.replace(/:id/g, "[id]"), "page.tsx");
    for (const path of LEGACY_COUNTRY_ROOTS) expect(existsSync(pageFor(path))).toBe(true);
  });

  it("checks the country query before falling back to the US", () => {
    const rules = legacyCountryRootRedirects().filter((rule) => rule.source === "/parties/:id");
    expect(rules).toEqual([
      expect.objectContaining({
        has: [expect.objectContaining({ type: "query", key: "country" })],
        destination: "/country/:country/parties/:id",
      }),
      expect.objectContaining({ destination: "/country/us/parties/:id" }),
    ]);
    expect(rules[1]).not.toHaveProperty("has");
    expect(rules.every((rule) => rule.permanent)).toBe(true);
  });
});
