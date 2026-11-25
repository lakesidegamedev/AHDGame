"use client";

/**
 * InboxClient — Desktop inbox shell.
 * Composes useInboxData + useReducer(inboxReducer) with the rail, reading pane,
 * segment chips, and grouping into "This turn / Earlier".
 */

import { useReducer, useMemo, useEffect, useRef, useState, useCallback } from "react";
import { useGameTurnStatus } from "@/hooks/useGameEvents";
import { useSearchParams } from "next/navigation";
import { INBOX_NOTIFICATION_LIMIT, useInboxData } from "./useInboxData";
import { inboxReducer, initialInboxState } from "./inboxReducer";
import { RailItem } from "./RailItem";
import { NotifDetail } from "./NotifDetail";
import { MailThreadView } from "./MailThreadView";
import { InboxEmpty } from "./InboxEmpty";
import { PriorityLane } from "./PriorityLane";
import type { InboxItem } from "@/lib/inbox";
import { useOptionalAuthMe } from "@/contexts/AuthDataContext";
import { bulkMarkRead } from "./bulkMarkRead";
import { defaultInboxSegment } from "@/lib/inbox/badgeLabel";
import { Skeleton, ListRowSkeleton } from "@/components/ui";
import type { InboxCategory } from "@/lib/inbox/categories";
import { CATEGORY_VISUALS } from "./inboxVisuals";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EyebrowInfo {
  name: string;
  seat: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function segmentLabel(seg: "all" | "action" | "notifs" | "mail"): string {
  switch (seg) {
    case "all":
      return "All";
    case "action":
      return "Needs action";
    case "notifs":
      return "Notifications";
    case "mail":
      return "Mail";
  }
}

const FOCUS_LIMIT = 24;

const asRead = (item: InboxItem): InboxItem => ({ ...item, unread: false, action: false });

/**
 * Keep the broad inbox views useful on busy accounts. Actionable unread items
 * always win the first slots, then the remaining unread items, then recent
 * history. Nothing is discarded: the rail exposes the rest through "Show
 * older".
 */
function focusItems(items: InboxItem[], limit = FOCUS_LIMIT): InboxItem[] {
  if (items.length <= limit) return items;

  const selected = new Set<string>();
  const focused: InboxItem[] = [];
  const add = (candidate: InboxItem) => {
    if (focused.length >= limit || selected.has(candidate.id)) return;
    selected.add(candidate.id);
    focused.push(candidate);
  };

  items.filter((item) => item.action && item.unread).forEach(add);
  items.filter((item) => item.unread).forEach(add);
  items.forEach(add);

  return focused;
}

function receivedMailIds(item: InboxItem): string[] {
  return (item.messages ?? [])
    .filter((message) => message.from === "them" && message.id)
    .map((message) => message.id as string);
}

function groupItems(
  items: InboxItem[],
  currentTurn: number | undefined
): { thisTurn: InboxItem[][]; earlier: InboxItem[][] } {
  const thisTurn: InboxItem[][] = [];
  const earlier: InboxItem[][] = [];
  for (const group of groupedRailItems(items)) {
    const turn = group[0].turn;
    if (turn != null && currentTurn != null && turn === String(currentTurn)) thisTurn.push(group);
    else earlier.push(group);
  }
  return { thisTurn, earlier };
}

function notificationThreadKey(item: InboxItem): string {
  if (item.kind === "mail") return `mail:${item.id}`;
  const href = item.source?.href;
  if (href && (item.type === "crisis" || item.type === "crisis_resolved")) {
    return `crisis:${item.label.includes("Shared by all your characters")}:${href}`;
  }
  if (href && item.type === "corp_credit_rating_change") return `credit:${item.label}:${href}`;
  return JSON.stringify([
    item.type,
    item.label,
    item.title,
    item.body,
    href,
    (item.meta ?? []).filter(([label]) => label !== "Turn"),
  ]);
}

function groupedRailItems(items: InboxItem[]): InboxItem[][] {
  const groups = new Map<string, InboxItem[]>();
  for (const item of items) {
    const key = notificationThreadKey(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()];
}

function InboxRailRows({
  groups,
  selectedId,
  compact,
  onSelect,
  onArchive,
}: {
  groups: InboxItem[][];
  selectedId: string | null;
  compact: boolean;
  onSelect: (item: InboxItem) => void;
  onArchive: (item: InboxItem) => void;
}) {
  const row = (item: InboxItem) => (
    <RailItem
      key={item.id}
      item={item}
      selected={item.id === selectedId}
      compact={compact}
      onSelect={() => onSelect(item)}
      onArchive={item.kind === "notif" ? () => onArchive(item) : undefined}
    />
  );

  return groups.map((group) => {
    const first = group[0];
    if (group.length === 1) return row(first);
    const unread = group.filter((item) => item.unread).length;
    return (
      <details key={first.id} className="border-b border-card-border">
        <summary className="cursor-pointer px-4 py-3 text-sm text-foreground">
          <span className={unread ? "font-semibold" : undefined}>{first.title}</span>
          <span className="ml-2 text-xs text-muted">
            {group.length} notifications{unread > 0 ? ` · ${unread} unread` : ""}
          </span>
        </summary>
        {group.map(row)}
      </details>
    );
  });
}

// ---------------------------------------------------------------------------
// MonoCount chip
// ---------------------------------------------------------------------------

function MonoCount({ n }: { n: number | null }) {
  return (
    <span
      aria-hidden={n === null}
      className="ml-1.5 inline-block min-w-6 rounded bg-card-elevated px-1 text-center font-mono text-[10px] tabular-nums text-muted"
    >
      {n ?? "\u00a0"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function InboxClient() {
  const { items, loading, error, refetch } = useInboxData();
  const searchParams = useSearchParams();
  const mailLink = searchParams?.get("tab") === "mail";
  const deepLinkId = searchParams?.get("id") ?? null;
  const [state, dispatch] = useReducer(
    inboxReducer,
    mailLink && !deepLinkId ? { ...initialInboxState, seg: "mail" } : initialInboxState
  );
  // The eyebrow is decorative identity text the shell already fetched for the
  // navbar, so read it from the shared bootstrap instead of issuing a second
  // full /api/auth/me session lookup on every inbox view.
  const auth = useOptionalAuthMe();
  const navData = auth?.navData ?? null;
  const refreshNav = auth?.refetch;
  const eyebrow: EyebrowInfo | null = navData?.characterName
    ? {
        name: navData.characterName,
        seat:
          navData.cabinetOffice?.positionName ??
          navData.governorOffice?.stateName ??
          navData.currentParty?.name ??
          "",
      }
    : null;
  const [showHistory, setShowHistory] = useState(false);
  const [priorityOnly, setPriorityOnly] = useState(false);
  const filterPriority = state.seg === "notifs" && priorityOnly;
  // Mobile: false = rail visible, true = reading pane visible (full-screen).
  // Ignored at lg+ where both columns always show.
  const [mobileReader, setMobileReader] = useState(false);
  const [markAllError, setMarkAllError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  // Narrow the list by category and by text, on top of the segment tabs.
  const [categoryFilter, setCategoryFilter] = useState<InboxCategory | "all">("all");
  const [query, setQuery] = useState("");

  // Derive the items for the active segment, hiding archived
  const segmentItems = useMemo(() => {
    const base = items.filter((i) => !state.archivedIds.has(i.id) && !state.snoozedIds.has(i.id));
    if (state.seg === "notifs") {
      return base.filter(
        (i) => i.kind === "notif" && (!filterPriority || i.urgency === "urgent" || i.action)
      );
    }
    if (state.seg === "mail") return base.filter((i) => i.kind === "mail");
    if (state.seg === "action") {
      return base.filter((i) => {
        const effectivelyUnread = i.unread && !state.readIds.has(i.id);
        // The open item stays put after opening it marks it read.
        return (i.action && effectivelyUnread) || i.id === state.selId;
      });
    }
    return base;
  }, [
    items,
    state.seg,
    state.archivedIds,
    state.snoozedIds,
    state.readIds,
    state.selId,
    filterPriority,
  ]);

  // Categories present in the current segment, for the filter chips.
  const presentCategories = useMemo(
    () => [...new Set(segmentItems.map((i) => i.category))],
    [segmentItems]
  );
  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return segmentItems.filter(
      (i) =>
        (categoryFilter === "all" || i.category === categoryFilter) &&
        (!needle || `${i.label} ${i.title} ${i.body ?? ""}`.toLowerCase().includes(needle))
    );
  }, [segmentItems, categoryFilter, query]);

  const counts = useMemo(() => {
    const activeItems = items.filter(
      (item) => !state.archivedIds.has(item.id) && !state.snoozedIds.has(item.id)
    );
    const unread = (item: InboxItem) => item.unread && !state.readIds.has(item.id);
    return {
      all: activeItems.filter(unread).length,
      notifs: activeItems.filter((item) => item.kind === "notif" && unread(item)).length,
      mail: activeItems.filter((item) => item.kind === "mail" && unread(item)).length,
      action: activeItems.filter((item) => item.action && unread(item)).length,
    };
  }, [items, state.archivedIds, state.snoozedIds, state.readIds]);

  // Open on the unread items when nothing needs action, so a full inbox never
  // greets the player with "all caught up".
  const [defaultSegSettled, setDefaultSegSettled] = useState(false);
  if (!loading && !defaultSegSettled) {
    setDefaultSegSettled(true);
    if (!mailLink && !deepLinkId && state.seg === "action") {
      const seg = defaultInboxSegment(counts);
      if (seg !== "action") dispatch({ type: "SET_SEG", seg });
    }
  }

  // The open item keeps its original rank in the focused list (it is ranked
  // before it turns read), then is shown as read.
  const railItems = useMemo(() => {
    const ranked = visibleItems.map((item) =>
      state.readIds.has(item.id) && item.id !== state.selId ? asRead(item) : item
    );
    const shown = showHistory ? ranked : focusItems(ranked);
    return shown.map((item) => (state.readIds.has(item.id) ? asRead(item) : item));
  }, [visibleItems, state.readIds, state.selId, showHistory]);

  // Derive effective selected item (default to first if none selected)
  const selId =
    state.selId && railItems.some((item) => item.id === state.selId)
      ? state.selId
      : (railItems[0]?.id ?? null);
  const sel = railItems.find((i) => i.id === selId) ?? null;

  const currentTurn = useGameTurnStatus()?.currentTurn;
  const { thisTurn, earlier } = useMemo(
    () => groupItems(railItems, currentTurn),
    [railItems, currentTurn]
  );
  const hiddenCount = Math.max(0, visibleItems.length - railItems.length);

  // Select + mark read
  const handleSelect = useCallback(
    async (item: InboxItem) => {
      dispatch({ type: "SELECT", id: item.id });
      setMobileReader(true);
      if (item.unread && !state.readIds.has(item.id)) {
        dispatch({ type: "MARK_READ", id: item.id });
        try {
          if (item.kind === "notif") {
            await fetch("/api/notifications", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: item.id, action: "read" }),
            });
          } else {
            await Promise.all(
              receivedMailIds(item).map((id) => fetch(`/api/mail/${id}`, { method: "PATCH" }))
            );
            refreshNav?.();
          }
        } catch {
          // Best-effort — UI is already updated optimistically
        }
      }
    },
    [state.readIds, refreshNav]
  );

  useEffect(() => {
    if (!mailLink || deepLinkId) return;
    dispatch({ type: "SET_SEG", seg: "mail" });
    setMobileReader(false);
    setShowHistory(false);
  }, [mailLink, deepLinkId]);
  // Deep link from the navbar bell: /notifications?id=<notification id> opens
  // that item. Widen the segment and history so the item is on the rail even
  // when it is read or older than the focused list, then select it once.
  const handledDeepLinkId = useRef<string | null>(null);
  useEffect(() => {
    if (!deepLinkId || loading || handledDeepLinkId.current === deepLinkId) return;
    const target = items.find((item) => item.id === deepLinkId);
    handledDeepLinkId.current = deepLinkId;
    if (!target) return;
    dispatch({ type: "SET_SEG", seg: "all" });
    setShowHistory(true);
    void handleSelect(target);
  }, [deepLinkId, loading, items, handleSelect]);

  const [archiveError, setArchiveError] = useState(false);

  // Archive
  const handleArchive = useCallback(
    async (item: InboxItem) => {
      setArchiveError(false);
      dispatch({ type: "ARCHIVE", id: item.id });
      try {
        if (item.kind === "mail") {
          await Promise.all(
            receivedMailIds(item).map((id) => fetch(`/api/mail/${id}`, { method: "DELETE" }))
          );
          refreshNav?.();
        } else {
          const response = await fetch("/api/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: item.id, action: "archive" }),
          });
          if (!response.ok) throw new Error("Archive request failed");
          refreshNav?.();
        }
      } catch {
        dispatch({ type: "UNARCHIVE", id: item.id });
        setArchiveError(true);
      }
    },
    [refreshNav]
  );

  // Snooze
  const handleSnooze = useCallback(async (item: InboxItem) => {
    dispatch({ type: "SNOOZE", id: item.id });
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, action: "snooze" }),
      });
    } catch {
      // Best-effort
    }
  }, []);

  // Mark all read — optimistic update, then one bulk request per kind (notifications,
  // mail). Any item the server rejects is rolled back so the client never silently diverges,
  // the player sees an error, and refetch() reconciles with server state.
  const handleMarkAllRead = useCallback(async () => {
    const unreadItems = visibleItems.filter((item) => item.unread && !state.readIds.has(item.id));
    if (unreadItems.length === 0 || markingAll) return;
    setMarkAllError(null);
    setMarkingAll(true);
    dispatch({
      type: "MARK_ALL_READ",
      ids: unreadItems.map((item) => item.id),
    });
    const notifIds = unreadItems.filter((item) => item.kind !== "mail").map((item) => item.id);
    const mailIds = unreadItems.filter((item) => item.kind === "mail").flatMap(receivedMailIds);
    const [notifResult, mailResult] = await Promise.all([
      bulkMarkRead("/api/notifications", notifIds),
      bulkMarkRead("/api/mail", mailIds),
    ]);
    const failedIds = unreadItems
      .filter((item) =>
        item.kind === "mail"
          ? receivedMailIds(item).some((id) => mailResult.failedIds.has(id))
          : notifResult.failedIds.has(item.id)
      )
      .map((item) => item.id);
    if (failedIds.length > 0) {
      dispatch({ type: "UNMARK_READ", ids: failedIds });
      console.error("[inbox] Failed to mark all read", { failed: failedIds.length });
      setMarkAllError(
        notifResult.rateLimited || mailResult.rateLimited
          ? "Too many requests right now. Wait a few seconds and try again."
          : failedIds.length === unreadItems.length
            ? "Couldn't mark everything as read. Please try again."
            : "Some items couldn't be marked as read. Please try again."
      );
      refetch();
    }
    if (mailIds.length > 0) refreshNav?.();
    setMarkingAll(false);
  }, [visibleItems, state.readIds, markingAll, refetch, refreshNav]);

  // Error state
  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <p className="text-sm text-error">{error}</p>
        <button
          type="button"
          onClick={refetch}
          className="text-sm text-primary underline underline-offset-2"
        >
          Try again
        </button>
      </div>
    );
  }

  const compact = state.density === "compact";

  return (
    <div className="mx-auto min-h-[50vh] max-w-7xl px-4 pb-16 sm:px-6" aria-busy={loading}>
      {/* Page header */}
      <div className="mb-6 mt-6 flex items-start justify-between gap-4">
        <div>
          {/* Eyebrow */}
          <p className="mb-0.5 min-h-[1.125rem] text-body-sm font-medium text-muted">
            {eyebrow?.name}
            {eyebrow?.seat ? <span className="mx-1.5 opacity-40">·</span> : null}
            {eyebrow?.seat}
          </p>
          <h1 className="text-2xl font-bold text-foreground">Inbox</h1>
          <p className="mt-1 text-sm text-muted">
            {loading ? (
              <span
                className="inline-block h-3 w-32 animate-pulse rounded bg-muted/30"
                aria-hidden
              />
            ) : state.seg === "action" ? (
              <>
                <span className="font-mono tabular-nums">{counts.action}</span>
                {counts.action === 1 ? " item needs" : " items need"} your input
              </>
            ) : (
              <>
                <span className="font-mono tabular-nums">{counts.all}</span> unread
                {counts.action > 0 && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={() => dispatch({ type: "SET_SEG", seg: "action" })}
                      className="font-mono tabular-nums text-error underline-offset-2 hover:underline"
                    >
                      {counts.action} priority
                    </button>
                  </>
                )}
              </>
            )}
          </p>
        </div>

        {/* Mark all read */}
        <button
          type="button"
          onClick={() => void handleMarkAllRead()}
          disabled={loading || counts.all === 0 || markingAll}
          className="shrink-0 rounded-lg border border-card-border bg-card px-3.5 py-1.5 text-sm font-medium text-muted transition-colors hover:border-primary/30 hover:text-foreground disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none"
        >
          {markingAll ? "Marking…" : "Mark all read"}
        </button>
      </div>

      {state.seg === "notifs" && !loading && (
        <label className="mb-3 flex w-fit items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={priorityOnly}
            onChange={(event) => setPriorityOnly(event.target.checked)}
          />
          Priority only
        </label>
      )}

      {/* Mark-all-read failure — rolled back to server state, player can retry */}
      {markAllError && (
        <div
          role="alert"
          className="mb-5 flex items-center gap-3 rounded-xl border border-error/30 bg-error/10 px-4 py-3"
        >
          <p className="flex-1 text-sm text-error">{markAllError}</p>
          <button
            type="button"
            onClick={() => void handleMarkAllRead()}
            className="shrink-0 text-sm font-medium text-error underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}

      <div role="tablist" aria-label="Inbox segment" className="mb-5 flex flex-wrap gap-1.5">
        {(["action", "all", "notifs", "mail"] as const).map((seg) => {
          const active = state.seg === seg;
          const count =
            seg === "all"
              ? counts.all
              : seg === "action"
                ? counts.action
                : seg === "notifs"
                  ? counts.notifs
                  : counts.mail;
          return (
            <button
              key={seg}
              role="tab"
              type="button"
              aria-selected={active}
              disabled={loading}
              onClick={() => {
                dispatch({ type: "SET_SEG", seg });
                if (seg !== "mail" && mailLink) {
                  const url = new URL(window.location.href);
                  url.searchParams.delete("tab");
                  window.history.replaceState(null, "", url);
                }
                setMobileReader(false);
                setShowHistory(false);
              }}
              className={[
                "flex items-center rounded-full border px-3.5 py-1 text-sm font-medium transition-colors motion-reduce:transition-none",
                active
                  ? seg === "action"
                    ? "border-error/30 bg-error/10 text-error"
                    : "border-primary/30 bg-primary/10 text-primary"
                  : seg === "action"
                    ? "border-card-border bg-card text-muted hover:border-error/20 hover:text-error"
                    : "border-card-border bg-card text-muted hover:border-primary/20 hover:text-foreground",
              ].join(" ")}
            >
              {segmentLabel(seg)}
              <MonoCount n={loading ? null : count} />
            </button>
          );
        })}
      </div>

      {!loading && items.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your inbox"
            aria-label="Search your inbox"
            className="w-full rounded-lg border border-card-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted sm:w-64"
          />
          <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-1.5">
            {(["all", ...presentCategories] as const).map((cat) => {
              const active = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategoryFilter(cat)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-card-border bg-card text-muted hover:text-foreground"
                  }`}
                >
                  {cat === "all" ? "All categories" : CATEGORY_VISUALS[cat].label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!loading && <PriorityLane onResolved={refetch} />}

      {loading && (
        <div className="grid gap-6 lg:h-[calc(100vh-240px)] lg:grid-cols-[352px_1fr]" aria-hidden>
          <div className="rounded-xl border border-card-border bg-card px-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <ListRowSkeleton key={index} lines={2} />
            ))}
          </div>
          <div className="hidden min-h-0 space-y-3 rounded-xl border border-card-border bg-card p-6 lg:block">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="mt-6 h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && visibleItems.length === 0 && (
        <InboxEmpty
          filterLabel={segmentLabel(state.seg)}
          variant={state.seg === "action" ? "priority" : "default"}
        />
      )}

      {/* Two-column grid: 352px rail | 1fr reading pane */}
      {!loading && visibleItems.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[352px_1fr] lg:h-[calc(100vh-240px)]">
          {/* Rail */}
          <div
            className={`min-h-0 overflow-y-auto rounded-xl border border-card-border bg-card lg:block ${mobileReader ? "hidden" : "block"}`}
          >
            <h2 className="sr-only">Messages</h2>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-card-border bg-card/95 px-4 py-3 backdrop-blur">
              <div className="min-w-0">
                <p className="text-body-sm font-medium text-muted">
                  {showHistory ? "Available history" : "Working set"}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  <span className="font-mono tabular-nums text-foreground">{railItems.length}</span>{" "}
                  {hiddenCount > 0 ? `of ${visibleItems.length} items` : "items"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    dispatch({ type: "SET_DENSITY", density: compact ? "comfortable" : "compact" })
                  }
                  className="rounded-md border border-card-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted transition-colors hover:border-primary/30 hover:text-foreground"
                  aria-label={compact ? "Use comfortable density" : "Use compact density"}
                >
                  {compact ? "Roomy" : "Compact"}
                </button>
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowHistory((current) => !current)}
                    className="rounded-md border border-primary/25 bg-primary/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary transition-colors hover:bg-primary/10"
                  >
                    {showHistory ? "Recent" : `Show older (${hiddenCount})`}
                  </button>
                )}
              </div>
            </div>

            <p className="border-b border-card-border px-4 py-2 text-xs text-muted">
              Shows up to the latest {INBOX_NOTIFICATION_LIMIT} notifications.
            </p>
            {archiveError && (
              <p role="alert" className="px-4 py-2 text-xs text-error">
                Couldn’t archive the item. Try again.
              </p>
            )}
            {thisTurn.length > 0 && (
              <>
                <div className="border-b border-card-border bg-card-elevated/25 px-4 py-2">
                  <p className="text-body-sm font-medium text-foreground/70">
                    This turn · {currentTurn}
                  </p>
                </div>
                <InboxRailRows
                  groups={thisTurn}
                  selectedId={selId}
                  compact={compact}
                  onSelect={(item) => void handleSelect(item)}
                  onArchive={(item) => void handleArchive(item)}
                />
              </>
            )}

            {earlier.length > 0 && (
              <>
                <div className="border-b border-card-border bg-card-elevated/25 px-4 py-2">
                  <p className="text-body-sm font-medium text-foreground/70">
                    Earlier and unlabelled turns
                  </p>
                </div>
                <InboxRailRows
                  groups={earlier}
                  selectedId={selId}
                  compact={compact}
                  onSelect={(item) => void handleSelect(item)}
                  onArchive={(item) => void handleArchive(item)}
                />
              </>
            )}
          </div>

          {/* Reading pane */}
          <div
            className={`min-h-[480px] overflow-hidden rounded-xl border border-card-border bg-card lg:block ${mobileReader ? "block" : "hidden"}`}
          >
            <h2 className="sr-only">Open message</h2>
            {/* Mobile back-to-list */}
            <button
              type="button"
              onClick={() => setMobileReader(false)}
              className="flex w-full items-center gap-1.5 border-b border-card-border px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground lg:hidden"
            >
              <span aria-hidden>←</span> Back to inbox
            </button>
            {sel == null ? (
              <InboxEmpty />
            ) : sel.kind === "mail" ? (
              <MailThreadView
                key={sel.id}
                item={sel}
                onArchive={() => void handleArchive(sel)}
                onSent={refetch}
              />
            ) : (
              <NotifDetail
                item={sel}
                onArchive={() => void handleArchive(sel)}
                onSnooze={() => void handleSnooze(sel)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
