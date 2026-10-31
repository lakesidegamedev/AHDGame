"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/**
 * Mounts the product analytics glue after the page is interactive.
 *
 * `PostHogTracker` is a render-null component: it only runs effects that
 * identify the account, set event context and forward consented product events.
 * Its static import still put ~40 KB gzipped of analytics glue in the first load
 * of every page, where it competed with hydration for the main thread.
 *
 * PostHog and Amplitude themselves are already loaded on demand behind consent;
 * this only moves the wrapper. Nothing is lost by waiting: the tracker reads the
 * current route and account on mount, and events raised before it mounts are
 * buffered by the capture helpers (or dropped by design when consent is absent).
 */
const PostHogTracker = dynamic(
  () => import("@/components/PostHogTracker").then((module) => module.PostHogTracker),
  { ssr: false }
);

export function DeferredAnalytics() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // `typeof` guard first: this repo also renders in a server pass, and the
    // idle callback is not in every target's DOM lib.
    const supportsIdle = typeof window !== "undefined" && "requestIdleCallback" in window;
    if (supportsIdle) {
      const id = window.requestIdleCallback(() => setReady(true), { timeout: 4_000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(() => setReady(true), 1_500);
    return () => clearTimeout(timer);
  }, []);

  return ready ? <PostHogTracker /> : null;
}
