import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COOKIE_CONSENT_KEY } from "@/lib/analytics/storageKeys";
import { getEraConfig } from "@/components/landing/eraThemes";
import { getEraFlavorCards } from "@/components/landing/flavorCards";
import { ANNOUNCED_2027_LAUNCH } from "@/lib/landing/rules/launchSchedule";
import { fallbackMarketedWorld } from "@/lib/marketing/marketedWorld";
import { renderLandingHtml, type StaticLandingInput } from "./renderLanding";
import { STATIC_LANDING_CSS } from "./staticLandingCss.generated";
import { LANDING_ISLANDS } from "./islandManifest.generated";

function tree(file: string, ns: string): Record<string, unknown> {
  return JSON.parse(readFileSync(`messages/en/${file}.json`, "utf8"))[ns];
}
const trees = {
  auth: tree("auth", "auth"),
  nav: tree("nav", "nav"),
  layout: tree("layout", "layout"),
};
const lookup = (root: unknown, key: string): unknown =>
  key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], root);
const fill = (text: string, values: Record<string, string | number> = {}) =>
  text
    .replace(/\{(\w+), plural,[^}]*\{[^}]*\}[^}]*\{([^}]*)\}\}/g, (_m, name, other) =>
      other.replace("#", String(values[name]))
    )
    .replace(/\{(\w+)\}/g, (_m, key) => String(values[key] ?? ""));
const t = (key: string, values?: Record<string, string | number>) => {
  const raw = lookup(trees.auth, key);
  return typeof raw === "string" ? fill(raw, values) : key;
};

function input(overrides: Partial<StaticLandingInput> = {}): StaticLandingInput {
  return {
    t,
    labels: {
      contests: "Contests",
      help: "Help",
      signIn: "Sign in",
      register: "Register",
      skip: "Skip to main content",
    },
    macroSimulated: true,
    locale: "en",
    era: getEraConfig(2027),
    world: fallbackMarketedWorld(2027),
    launch: {
      phase: "sealed",
      opensAt: ANNOUNCED_2027_LAUNCH.opensAt,
      firstTurnAt: ANNOUNCED_2027_LAUNCH.firstTurnAt,
    },
    currentYear: 2027,
    government: {},
    crises: [],
    discord: null,
    flavorCards: getEraFlavorCards(2027),
    posterBase: "/landing/globe-2027-h5",
    globe: { geoUrl: "/world.json", kinds: {}, nav: {}, markers: [] },
    meta: {
      title: "A House Divided | Political & Economic Sim Game",
      description: 'A description with <markup> & quotes "here".',
      keywords: "a, b",
      canonical: "https://ahousedividedgame.com",
      siteName: "A House Divided",
      ogImage: "https://cdn.example/logo.png",
      jsonLd: "{}",
    },
    css: STATIC_LANDING_CSS,
    islands: LANDING_ISLANDS,
    posthogKey: "phc_test",
    gameVersion: "1.20.0",
    ...overrides,
  };
}

describe("renderLandingHtml", () => {
  const html = renderLandingHtml(input());

  it("is a complete document with no framework scripts", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toContain("/_next/");
    const sources = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
    expect(sources).toEqual([LANDING_ISLANDS.countdown, LANDING_ISLANDS.consent]);
    for (const src of sources) expect(src).toMatch(/^\/landing\/js\/[a-z]+\.[0-9a-f]{10}\.js$/);
  });

  it("carries the page metadata, escaped", () => {
    expect(html).toContain("<title>A House Divided | Political &amp; Economic Sim Game</title>");
    expect(html).toContain('<link rel="canonical" href="https://ahousedividedgame.com"/>');
    expect(html).toContain(
      'name="description" content="A description with &lt;markup&gt; &amp; quotes &quot;here&quot;."'
    );
    expect(html).toContain('property="og:image" content="https://cdn.example/logo.png"');
  });

  it("has the hero copy and the three actions", () => {
    const era = getEraConfig(2027);
    expect(html).toContain("A political simulation set in");
    expect(html).toContain(era.heroDek.replace(/&/g, "&amp;"));
    expect(html).toMatch(/<a href="\/register"[^>]*>Sign up/);
    expect(html).toMatch(/<a href="\/login"[^>]*>Sign in/);
    expect(html).toMatch(/<a href="\/world"[^>]*>Explore/);
  });

  it("renders the countdown for the launch times, for the island to tick", () => {
    expect(html).toContain(`data-countdown="${ANNOUNCED_2027_LAUNCH.opensAt}"`);
    expect(html).toContain(`data-countdown="${ANNOUNCED_2027_LAUNCH.firstTurnAt}"`);
    expect(renderLandingHtml(input({ launch: null }))).not.toContain("data-countdown");
  });

  it("server-renders the poster so the globe box never shifts", () => {
    expect(html).toContain('<source type="image/avif" srcset="/landing/globe-2027-h5-960.avif"/>');
    expect(html).toContain('width="960" height="960"');
    expect(html).toContain(`data-globe-src="${LANDING_ISLANDS.globe}"`);
  });

  it("has the cookie banner wired to the shared consent key and values", () => {
    expect(html).toContain('data-consent="accepted"');
    expect(html).toContain('data-consent="rejected"');
    expect(html).toContain(`localStorage.getItem("${COOKIE_CONSENT_KEY}")`);
    expect(html).toContain("data-cookie-settings");
  });

  it("keeps the site navigation, community and footer links", () => {
    for (const href of ["/privacy", "/terms", "/guides", "/wiki", "/faq", "/news", "/supporters"]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toContain("Join Discord");
  });

  it("passes the globe island its config as JSON that cannot close the script", () => {
    const json = html.match(
      /<script type="application\/json" id="landing-config">([\s\S]*?)<\/script>/
    );
    expect(JSON.parse(json![1])).toMatchObject({ posthogKey: "phc_test", gameVersion: "1.20.0" });
    const hostile = renderLandingHtml(input({ globe: { note: "</script><b>" } }));
    expect(hostile).not.toContain("</script><b>");
  });
});
