"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { getStoredConsent } from "@/components/CookieConsent";
import { startAnonymousPageviews } from "@/lib/analytics/posthogClient";

/**
 * Starts analytics after the page is idle, never during hydration.
 *
 * A visitor who has accepted analytics gets the full tracker. Everyone else gets
 * anonymous page counts only, with nothing stored on the device. The mode is
 * fixed for the page load: a visitor who accepts mid-visit is upgraded on the
 * next full page load.
 *
 * `PostHogTracker` is a render-null component that only runs effects, so it is
 * split out of the first load of every page.
 */
const PostHogTracker = dynamic(
  () => import("@/components/PostHogTracker").then((module) => module.PostHogTracker),
  { ssr: false }
);

const IDLE_TIMEOUT_MS = 3_000;

export function DeferredAnalytics() {
  const [full, setFull] = useState(false);

  useEffect(() => {
    const start = () => {
      if (getStoredConsent() === "accepted") setFull(true);
      else startAnonymousPageviews();
    };
    // `typeof` guard first: this repo also renders in a server pass, and the
    // idle callback is not in every target's DOM lib.
    const supportsIdle = typeof window !== "undefined" && "requestIdleCallback" in window;
    if (supportsIdle) {
      const id = window.requestIdleCallback(start, { timeout: IDLE_TIMEOUT_MS });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(start, 1_500);
    return () => clearTimeout(timer);
  }, []);

  return full ? <PostHogTracker /> : null;
}
