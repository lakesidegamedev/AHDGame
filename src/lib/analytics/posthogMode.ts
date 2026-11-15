import type { PostHogConfig } from "posthog-js";

export type PostHogMode = "anonymous" | "full";

export type ConsentAnswer = "accepted" | "rejected" | null;

/** Decided once per page load: PostHog cannot change mode after init. */
export function resolvePostHogMode(consent: ConsentAnswer): PostHogMode {
  return consent === "accepted" ? "full" : "anonymous";
}

const API_HOST = "https://us.i.posthog.com";

const COMMON: Partial<PostHogConfig> = {
  api_host: API_HOST,
  autocapture: false,
  capture_exceptions: false,
  capture_heatmaps: false,
  capture_dead_clicks: false,
  capture_pageleave: false,
  capture_pageview: "history_change",
  disable_surveys: true,
  property_denylist: ["$ip", "ip", "email"],
};

/**
 * Anonymous page views only: no cookies, no browser storage, no identity, no
 * replay, no flags. Identity is a server-side hash.
 */
export function anonymousPostHogConfig(): Partial<PostHogConfig> {
  return {
    ...COMMON,
    cookieless_mode: "always",
    person_profiles: "never",
    disable_session_recording: true,
    advanced_disable_feature_flags: true,
  };
}

/** The consented setup: identified events and sampled, masked replay. */
export function fullPostHogConfig(): Partial<PostHogConfig> {
  return {
    ...COMMON,
    session_recording: {
      sampleRate: 0.1,
      maskAllInputs: true,
      recordHeaders: false,
      recordBody: false,
      blockSelector: "[data-replay-block]",
    },
    advanced_disable_feature_flags: false,
    persistence: "localStorage+cookie",
  };
}

export function postHogConfigFor(mode: PostHogMode): Partial<PostHogConfig> {
  return mode === "full" ? fullPostHogConfig() : anonymousPostHogConfig();
}
