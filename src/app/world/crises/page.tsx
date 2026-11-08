"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchJson } from "@/lib/observability/fetchJson";
import type { CrisisBoard, BoardCrisis } from "@/lib/crises/queries/crisisBoard";
import { SovereignDebtWatchPanel } from "@/components/world/SovereignDebtWatchPanel";
import type { Conflict } from "@/app/world/conflicts/_coldwar/conflicts";
import { CrisisBoardMap } from "./CrisisBoardMap";
import { BoardCard, ExposurePanel, GROUP_META, GROUP_ORDER } from "./CrisisBoardCards";
import { SEVERITY_BADGE } from "./crisisBoardStyle";

type View = "all" | "mine" | "conflicts" | "global" | "country" | "region" | "debt";

const VIEWS: Array<{ id: View; label: string }> = [
  { id: "all", label: "All" },
  { id: "mine", label: "Affecting me" },
  { id: "conflicts", label: "Conflicts" },
  { id: "global", label: "Global" },
  { id: "country", label: "National" },
  { id: "region", label: "Regional" },
  { id: "debt", label: "Debt watch" },
];

const CONFLICT_SEVERITY_BADGE: Record<Conflict["sev"], string> = {
  CRITICAL: SEVERITY_BADGE.high,
  MAJOR: SEVERITY_BADGE.high,
  ACTIVE: SEVERITY_BADGE.medium,
  "WINDING DOWN": SEVERITY_BADGE.low,
};

function matchesView(c: BoardCrisis, view: View): boolean {
  switch (view) {
    case "mine":
      return c.exposure.length > 0;
    case "conflicts":
      return c.kind === "war";
    case "global":
    case "country":
    case "region":
      return c.scope === view;
    default:
      return true;
  }
}

function WarRow({ conflict }: { conflict: Conflict }) {
  return (
    <Link
      href={`/world/conflicts/${conflict.conflictId}`}
      className="flex items-center gap-2 rounded-lg border border-card-border bg-card p-3 text-sm hover:border-foreground/30"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-foreground">{conflict.name}</span>
        <span className="block text-xs text-muted">
          {conflict.region} · {conflict.west} vs {conflict.east} · {conflict.deaths}
        </span>
      </span>
      {conflict.escalating && <span className="text-xs text-warning">Escalating</span>}
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${CONFLICT_SEVERITY_BADGE[conflict.sev]}`}
      >
        {conflict.sev === "WINDING DOWN" ? "Winding down" : conflict.sev.toLowerCase()}
      </span>
    </Link>
  );
}

function CrisisBoardPage() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("view") as View | null;
  const view: View = VIEWS.some((v) => v.id === requested) ? (requested as View) : "all";

  const [board, setBoard] = useState<CrisisBoard | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/crises/board", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setBoard((await r.json()) as CrisisBoard);
      setError(null);
    } catch {
      setError("Could not load crisis data. Please try again.");
    }
  }, []);

  useEffect(() => {
    load();
    fetchJson<{ user?: { isAdmin?: boolean } }>("/api/auth/me", { feature: "world-crises-auth" })
      .then((d) => setIsAdmin(!!d.user?.isAdmin))
      .catch(() => {});
    fetchJson<{ conflicts?: Conflict[] }>("/api/world/conflicts/feed", {
      feature: "world-crises-conflicts",
    })
      .then((d) => setConflicts(d.conflicts ?? []))
      .catch(() => {});
  }, [load]);

  const setView = (next: View) =>
    router.replace(next === "all" ? "/world/crises" : `/world/crises?view=${next}`);

  const visible = useMemo(
    () => (board?.crises ?? []).filter((c) => matchesView(c, view)),
    [board, view]
  );
  const active = visible.filter((c) => c.status === "active");
  const selected = visible.find((c) => c.id === selectedId) ?? null;

  const focus = (id: string) => {
    setSelectedId(id);
    document
      .getElementById(`crisis-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const activeCount = (board?.crises ?? []).filter((c) => c.status === "active").length;
  const showWars = view === "all" || view === "conflicts";

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href="/world" className="text-xs text-muted hover:text-foreground">
              World
            </Link>
            <h1 className="text-2xl font-bold text-foreground">Crises</h1>
            <p className="text-sm text-muted">
              {board
                ? `${activeCount} active · ${board.actionCount} need your response`
                : "Loading"}
            </p>
          </div>
          {isAdmin && (
            <Link
              href="/admin?tab=world&sub=crises"
              className="rounded-lg border border-card-border bg-card px-3 py-2 text-sm text-muted hover:text-foreground"
            >
              Manage crises
            </Link>
          )}
        </header>

        <nav className="flex gap-1 overflow-x-auto rounded-xl border border-card-border bg-card p-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                view === v.id
                  ? "border border-card-border bg-card-elevated text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {v.label}
            </button>
          ))}
        </nav>

        {error ? (
          <div className="rounded-xl border border-card-border bg-card p-8 text-center">
            <p className="mb-3 text-sm text-muted">{error}</p>
            <button
              onClick={load}
              className="rounded-lg border border-card-border px-4 py-2 text-sm text-foreground"
            >
              Retry
            </button>
          </div>
        ) : view === "debt" ? (
          <SovereignDebtWatchPanel />
        ) : !board ? (
          <div className="h-80 animate-pulse rounded-xl border border-card-border bg-card" />
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-3 lg:col-span-2">
                <CrisisBoardMap
                  crises={active}
                  links={board.links}
                  selectedId={selectedId}
                  onSelect={focus}
                />
                {selected && (
                  <BoardCard crisis={selected} selected onFocus={focus} onPulled={load} />
                )}
              </div>
              <ExposurePanel crises={board.crises} authenticated={board.authenticated} />
            </div>

            {GROUP_ORDER.map((group) => {
              const rows = visible.filter((c) => c.group === group);
              if (rows.length === 0) return null;
              return (
                <section key={group} className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-base font-semibold text-foreground">
                      {GROUP_META[group].title}
                    </h2>
                    <span className="text-xs tabular-nums text-muted">{rows.length}</span>
                    <span className="hidden text-xs text-muted sm:inline">
                      {GROUP_META[group].hint}
                    </span>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {rows.map((c) => (
                      <BoardCard
                        key={c.id}
                        crisis={c}
                        selected={c.id === selectedId}
                        onFocus={focus}
                        onPulled={load}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

            {visible.length === 0 && (
              <p className="rounded-xl border border-card-border bg-card p-8 text-center text-sm text-muted">
                Nothing matches this filter.
              </p>
            )}

            {showWars && (
              <section className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-base font-semibold text-foreground">Wars</h2>
                  <span className="text-xs tabular-nums text-muted">{conflicts.length}</span>
                  <Link
                    href="/world/conflicts/coldwar"
                    className="ml-auto text-xs text-muted hover:text-foreground"
                  >
                    Cold War console
                  </Link>
                </div>
                {conflicts.length === 0 ? (
                  <p className="text-sm text-muted">No wars are being fought.</p>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {conflicts.map((c) => (
                      <WarRow key={c.id} conflict={c} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function CrisesPage() {
  return (
    <Suspense fallback={null}>
      <CrisisBoardPage />
    </Suspense>
  );
}
