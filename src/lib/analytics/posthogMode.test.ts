import { describe, expect, it } from "vitest";
import {
  anonymousPostHogConfig,
  fullPostHogConfig,
  postHogConfigFor,
  resolvePostHogMode,
} from "./posthogMode";

describe("resolvePostHogMode", () => {
  it("is anonymous until the visitor accepts", () => {
    expect(resolvePostHogMode(null)).toBe("anonymous");
    expect(resolvePostHogMode("rejected")).toBe("anonymous");
  });

  it("is full after acceptance", () => {
    expect(resolvePostHogMode("accepted")).toBe("full");
  });
});

describe("anonymous config", () => {
  const config = anonymousPostHogConfig();

  it("stores nothing and identifies nobody", () => {
    expect(config.cookieless_mode).toBe("always");
    expect(config.person_profiles).toBe("never");
    expect("persistence" in config).toBe(false);
    expect("opt_out_capturing_by_default" in config).toBe(false);
  });

  it("records no sessions, autocapture or flags", () => {
    expect(config.disable_session_recording).toBe(true);
    expect(config.autocapture).toBe(false);
    expect(config.advanced_disable_feature_flags).toBe(true);
    expect(config.disable_surveys).toBe(true);
  });

  it("captures page views including client navigation", () => {
    expect(config.capture_pageview).toBe("history_change");
  });

  it("does not drop the page address or referrer", () => {
    for (const key of ["$current_url", "$pathname", "$referrer"]) {
      expect(config.property_denylist).not.toContain(key);
    }
  });
});

describe("full config", () => {
  const config = fullPostHogConfig();

  it("keeps sampled, masked replay and local persistence", () => {
    expect(config.session_recording.sampleRate).toBe(0.1);
    expect(config.session_recording.maskAllInputs).toBe(true);
    expect(config.persistence).toBe("localStorage+cookie");
    expect("cookieless_mode" in config).toBe(false);
  });

  it("captures page views including client navigation", () => {
    expect(config.capture_pageview).toBe("history_change");
  });

  it("still withholds email and IP", () => {
    expect(config.property_denylist).toContain("email");
    expect(config.property_denylist).toContain("$ip");
  });
});

describe("postHogConfigFor", () => {
  it("maps each mode to its config", () => {
    expect(postHogConfigFor("anonymous")).toEqual(anonymousPostHogConfig());
    expect(postHogConfigFor("full")).toEqual(fullPostHogConfig());
  });
});
