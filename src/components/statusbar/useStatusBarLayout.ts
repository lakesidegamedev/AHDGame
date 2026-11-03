"use client";

// Owns the StatusBar's layout-preference state. Seeds from the device
// (localStorage) on the first commit, then adopts the account preference once
// the auth bootstrap resolves. Listens for cross-tab storage changes so the
// settings toggle takes effect immediately.

import { useEffect, useRef, useState } from "react";
import { useAuthMe } from "@/contexts/AuthDataContext";

export type StatusBarLayout = "standard" | "corp" | "elections" | "full" | "minimal";

const LAYOUT_KEY = "statusBarLayout";
const VALID: readonly StatusBarLayout[] = [
  "standard",
  "corp",
  "elections",
  "full",
  "minimal",
] as const;

function isStatusBarLayout(value: unknown): value is StatusBarLayout {
  return typeof value === "string" && (VALID as readonly string[]).includes(value);
}

/** The device's stored layout, or null when this browser has none. */
function storedLayout(): StatusBarLayout | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(LAYOUT_KEY);
    return isStatusBarLayout(saved) ? saved : null;
  } catch {
    // Storage can be unavailable in hardened or private browser contexts.
    return null;
  }
}

/**
 * The bar's layout preference, and the layout its `/api/client-status` request
 * should ask for.
 *
 * The layout is part of that request's URL. Waiting for the account preference
 * to arrive over `/api/client-nav` put the whole status payload one round trip
 * behind the page, so the device value answers first: `layoutSynced` is true one
 * render after mount, which lets the request start with the first paint instead
 * of behind a network round trip. The account preference still wins when the two
 * disagree (another device changed it), which is the one case that pays a second
 * request.
 */
export function useStatusBarLayout(): { layout: StatusBarLayout; layoutSynced: boolean } {
  const { user: authUser, loading: authLoading } = useAuthMe();
  const [layout, setLayout] = useState<StatusBarLayout>("standard");
  const [layoutSynced, setLayoutSynced] = useState(false);
  const accountAppliedRef = useRef(false);

  /* eslint-disable react-hooks/set-state-in-effect -- reading external state */
  useEffect(() => {
    if (layoutSynced) return;
    const device = storedLayout();
    if (device) setLayout(device);
    setLayoutSynced(true);
  }, [layoutSynced]);

  useEffect(() => {
    if (authLoading || accountAppliedRef.current) return;
    accountAppliedRef.current = true;
    const serverLayout = authUser?.statusBarLayout;
    if (isStatusBarLayout(serverLayout)) {
      setLayout(serverLayout);
      try {
        localStorage.setItem(LAYOUT_KEY, serverLayout);
      } catch {
        // The account preference still holds for this visit.
      }
    }
  }, [authLoading, authUser]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== LAYOUT_KEY) return;
      if (isStatusBarLayout(e.newValue)) setLayout(e.newValue);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return { layout, layoutSynced };
}
