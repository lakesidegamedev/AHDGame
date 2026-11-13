import { describe, expect, it } from "vitest";
import {
  COOKIELESS_DISTINCT_ID,
  buildAnonymousPageview,
  type PageSnapshot,
} from "./anonymousPageviewBeacon";
import { anonymousPostHogConfig } from "./posthogMode";

const snapshot: PageSnapshot = {
  href: "https://ahousedividedgame.com/?utm_source=reddit&utm_campaign=launch&secret=1",
  referrer: "https://www.reddit.com/r/games/",
  userAgent: "Mozilla/5.0 test",
  language: "en-US",
  timezone: "America/New_York",
  screen: { width: 390, height: 844 },
  viewport: { width: 390, height: 700 },
};
const payload = buildAnonymousPageview(
  snapshot,
  "phc_test",
  new Date("2026-11-14T00:00:00Z"),
  "id1"
);

describe("anonymous page view beacon payload", () => {
  it("is a cookieless pageview with no person profile", () => {
    expect(payload.event).toBe("$pageview");
    expect(payload.api_key).toBe("phc_test");
    expect(payload.distinct_id).toBe(COOKIELESS_DISTINCT_ID);
    expect(payload.properties.$process_person_profile).toBe(false);
    expect(payload.properties.$cookieless_mode).toBe(true);
  });

  it("matches what the anonymous SDK config promises", () => {
    const config = anonymousPostHogConfig();
    expect(config.cookieless_mode).toBe("always");
    expect(config.person_profiles).toBe("never");
    expect(config.capture_pageview).toBe("history_change");
    for (const denied of config.property_denylist) {
      expect(Object.keys(payload.properties)).not.toContain(denied);
    }
  });

  it("carries the page, referrer and campaign tags only", () => {
    const { properties } = payload;
    expect(properties.$pathname).toBe("/");
    expect(properties.$host).toBe("ahousedividedgame.com");
    expect(properties.$referrer).toBe("https://www.reddit.com/r/games/");
    expect(properties.$referring_domain).toBe("www.reddit.com");
    expect(properties.utm_source).toBe("reddit");
    expect(properties.utm_campaign).toBe("launch");
    expect(properties).not.toHaveProperty("secret");
  });

  it("marks a direct visit", () => {
    const direct = buildAnonymousPageview({ ...snapshot, referrer: "" }, "k", new Date(0), "id2");
    expect(direct.properties.$referrer).toBe("$direct");
    expect(direct.properties.$referring_domain).toBe("$direct");
  });

  it("sends no identity fields", () => {
    const keys = Object.keys(payload.properties);
    for (const forbidden of ["$device_id", "$session_id", "$user_id", "email", "$ip", "$set"]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
