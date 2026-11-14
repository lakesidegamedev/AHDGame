import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COOKIE_CONSENT_KEY } from "@/lib/analytics/storageKeys";
import { LANDING_ISLANDS } from "@/lib/landing/static/islandManifest.generated";
import { STATIC_LANDING_CSS } from "@/lib/landing/static/staticLandingCss.generated";
import { buildIslands } from "../../scripts/landing/build-landing-islands.mjs";
import { renderLandingCssModule } from "../../scripts/landing/build-landing-css.mjs";

const read = (publicPath: string) => readFileSync(`public${publicPath}`, "utf8");

describe("landing islands", () => {
  it("write the same consent key and values as the app's cookie banner", () => {
    const bundle = read(LANDING_ISLANDS.consent);
    expect(bundle).toContain(JSON.stringify(COOKIE_CONSENT_KEY));
    expect(bundle).toContain('"accepted"');
    expect(bundle).toContain('"rejected"');
    const app = readFileSync("src/components/CookieConsent.tsx", "utf8");
    expect(app).toContain("COOKIE_CONSENT_KEY");
    expect(app).toContain('setConsent("accepted")');
    expect(app).toContain('setConsent("rejected")');
  });

  it("stay small", () => {
    expect(read(LANDING_ISLANDS.countdown).length).toBeLessThan(2048);
    expect(read(LANDING_ISLANDS.consent).length).toBeLessThan(6144);
  });

  it("committed bundles are fresh against their source", async () => {
    const { files, manifest } = await buildIslands();
    expect(readFileSync("src/lib/landing/static/islandManifest.generated.ts", "utf8")).toBe(
      manifest
    );
    for (const file of Object.values(files) as { fileName: string; contents: Buffer }[]) {
      expect(readFileSync(`public/landing/js/${file.fileName}`).equals(file.contents)).toBe(true);
    }
  }, 60_000);

  it("committed stylesheet is fresh against the renderer's classes", async () => {
    const { css } = await renderLandingCssModule();
    expect(STATIC_LANDING_CSS).toBe(css);
  }, 60_000);
});
