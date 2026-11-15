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

/** Launch week of the 2027 world records more first sessions; then back to the base rate. */
export const LAUNCH_REPLAY_SAMPLE_RATE = 0.33;
export const BASE_REPLAY_SAMPLE_RATE = 0.1;
export const LAUNCH_REPLAY_ENDS_AT = Date.parse("2026-11-23T05:00:00Z");

export function replaySampleRate(now: number = Date.now()): number {
  return now < LAUNCH_REPLAY_ENDS_AT ? LAUNCH_REPLAY_SAMPLE_RATE : BASE_REPLAY_SAMPLE_RATE;
}

/** The consented setup: identified events and sampled, masked replay. */
export function fullPostHogConfig(now: number = Date.now()): Partial<PostHogConfig> {
  return {
    ...COMMON,
    session_recording: {
      sampleRate: replaySampleRate(now),
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
