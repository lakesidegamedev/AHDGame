"use client";

import { useEffect, useState } from "react";

/** Data changes once per turn; this keeps a closed-then-reopened tray from refetching. */
const FRESH_MS = 60_000;
/** Background refresh while the page is visible. */
const REFRESH_MS = 120_000;

interface Entry {
  data: unknown;
  at: number;
}

const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
let queued = new Set<string>();

function notify() {
  for (const listener of listeners) listener();
}

async function flush(): Promise<void> {
  const keys = [...queued];
  queued = new Set();
  if (keys.length === 0) return;
  try {
    const response = await fetch(
      `/api/sidebar-widgets?keys=${encodeURIComponent(keys.join(","))}`,
      { credentials: "same-origin" }
    );
    if (!response.ok) throw new Error(String(response.status));
    const body = (await response.json()) as { data?: Record<string, unknown> };
    const now = Date.now();
    for (const key of keys) cache.set(key, { data: body.data?.[key] ?? null, at: now });
  } catch {
    // Keep what we had; a failed refresh retries on the next tick.
    for (const key of keys) if (!cache.has(key)) cache.set(key, { data: null, at: 0 });
  }
  notify();
}

/** Batch every widget asking in the same tick into one request. */
function request(keys: string[], force = false) {
  const now = Date.now();
  for (const key of keys) {
    const entry = cache.get(key);
    if (force || !entry || now - entry.at > FRESH_MS) queued.add(key);
  }
  if (queued.size === 0 || inflight) return;
  inflight = Promise.resolve()
    .then(flush)
    .finally(() => {
      inflight = null;
      if (queued.size > 0) request([]);
    });
}

/** Forget cached widget data, e.g. after the player acts on something a widget shows. */
export function refreshSidebarWidgets() {
  request([...cache.keys()], true);
}

/**
 * Widget data for `keys`, shared across every caller. Pass `poll: false` for a
 * one-off read, e.g. checking whether a role widget applies to this player.
 */
export function useSidebarWidgetData(
  keys: string[],
  { poll = true }: { poll?: boolean } = {}
): {
  data: Record<string, unknown>;
  loaded: (key: string) => boolean;
} {
  const signature = [...new Set(keys)].sort().join(",");
  const [, setVersion] = useState(0);

  useEffect(() => {
    const wanted = signature ? signature.split(",") : [];
    if (wanted.length === 0) return;
    const listener = () => setVersion((v) => v + 1);
    listeners.add(listener);
    request(wanted);
    if (!poll) {
      return () => {
        listeners.delete(listener);
      };
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") request(wanted);
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") request(wanted);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      listeners.delete(listener);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [signature, poll]);

  // Cheap: a handful of keys, re-read whenever a listener bumps the version.
  const data: Record<string, unknown> = {};
  for (const key of signature ? signature.split(",") : []) data[key] = cache.get(key)?.data;

  return { data, loaded: (key) => cache.has(key) };
}

/** Test hook: start each test with an empty cache. */
export function resetSidebarWidgetCache() {
  cache.clear();
  queued = new Set();
  inflight = null;
}
