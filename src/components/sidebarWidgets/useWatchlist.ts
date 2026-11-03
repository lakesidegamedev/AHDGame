"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useOptionalAuthMe, useRefetchNav } from "@/contexts/AuthDataContext";
import { useToast } from "@/contexts/ToastContext";
import {
  MAX_WATCHLIST,
  sameWatchItem,
  widgetWatchlist,
  type WatchItem,
} from "@/lib/sidebarWidgets/watchlist";
import { refreshSidebarWidgets } from "./useSidebarWidgetData";

// The star on a page and the widget's remove buttons share one unsaved copy,
// so either updates the other at once while the account save is in flight.
let unsaved: WatchItem[] | null = null;
const listeners = new Set<() => void>();

function setUnsaved(next: WatchItem[] | null) {
  unsaved = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface Watchlist {
  enabled: boolean;
  items: WatchItem[];
  full: boolean;
  isWatched: (item: WatchItem) => boolean;
  toggle: (item: WatchItem) => void;
  remove: (item: WatchItem) => void;
}

function useAccount() {
  const auth = useOptionalAuthMe();
  const navData = auth?.navData ?? null;
  const user = navData?.user ?? auth?.user ?? null;
  return {
    user,
    enabled: user?.experimentalFeatures === true && navData?.hasCharacter === true,
  };
}

/** Whether the watchlist is on for this player, without loading anything else. */
export function useWatchlistEnabled(): boolean {
  return useAccount().enabled;
}

/** The player's watchlist and account saves. Off unless experimental features are on. */
export function useWatchlist(): Watchlist {
  const t = useTranslations("nav.widgets.watchlist");
  const { user, enabled } = useAccount();
  const refetchNav = useRefetchNav();
  const { showToast } = useToast();
  const savedJson = JSON.stringify(widgetWatchlist(user?.widgetWatchlist));
  const pending = useSyncExternalStore(
    subscribe,
    () => unsaved,
    () => null
  );
  const items = pending ?? (JSON.parse(savedJson) as WatchItem[]);

  // Once the account reflects the save, drop the unsaved copy.
  useEffect(() => {
    if (unsaved && JSON.stringify(unsaved) === savedJson) setUnsaved(null);
  }, [savedJson]);

  const save = useCallback(
    (next: WatchItem[]) => {
      setUnsaved(next);
      fetch("/api/settings/experimental-features", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgetWatchlist: next }),
      })
        .then((response) => {
          if (!response.ok) throw new Error(String(response.status));
          refetchNav();
          refreshSidebarWidgets();
        })
        .catch(() => {
          setUnsaved(null);
          showToast(t("saveError"), "error");
        });
    },
    [refetchNav, showToast, t]
  );

  const isWatched = useCallback(
    (item: WatchItem) => items.some((kept) => sameWatchItem(kept, item)),
    [items]
  );

  const remove = useCallback(
    (item: WatchItem) => save(items.filter((kept) => !sameWatchItem(kept, item))),
    [items, save]
  );

  const toggle = useCallback(
    (item: WatchItem) => {
      if (isWatched(item)) {
        remove(item);
        return;
      }
      if (items.length >= MAX_WATCHLIST) {
        showToast(t("full", { max: MAX_WATCHLIST }), "error");
        return;
      }
      save([...items, item]);
    },
    [isWatched, items, remove, save, showToast, t]
  );

  return {
    enabled,
    items,
    full: items.length >= MAX_WATCHLIST,
    isWatched,
    toggle,
    remove,
  };
}

/** Test hook: start each test without an unsaved copy. */
export function resetWatchlistStore() {
  unsaved = null;
}
