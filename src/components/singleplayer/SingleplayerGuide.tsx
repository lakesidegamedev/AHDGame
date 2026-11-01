"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuthMe } from "@/contexts/AuthDataContext";
import type { SingleplayerGuide as GuideState } from "@/lib/singleplayerGuide";
import { reportSingleplayerGuideOffered } from "@/lib/singleplayerGuideClient";

const POLL_MS = 8_000;

/** Steps whose action is a page to open. End turn has its own button in the shell. */
const LINK_STEPS = new Set(["character", "campaign", "party", "inbox"]);

async function readGuide(init?: RequestInit): Promise<GuideState | null> {
  const res = await fetch("/api/singleplayer/guide", { credentials: "same-origin", ...init });
  return res.ok ? ((await res.json()) as GuideState) : null;
}

/**
 * First-game guide for a new local world in Career (normal) mode.
 *
 * A small card in the corner that lists a handful of first steps and ticks each
 * one off when the game state shows the player did it (see
 * src/lib/singleplayerGuide.ts). The next undone step is opened with a short
 * explanation and a link to where it happens. The player can fold it away or
 * close it; closing is stored on the world, so it never returns for that world
 * and a new world offers it again.
 *
 * Renders nothing outside a normal-mode local world, and nothing once the
 * server reports the guide inactive, so it costs one request in those cases.
 */
export function SingleplayerGuide() {
  const t = useTranslations("nav.singleplayer.guide");
  const pathname = usePathname();
  const { navData } = useAuthMe();
  const eligible = navData?.user?.singleplayerMode === "normal";
  const [guide, setGuide] = useState<GuideState | null>(null);
  const [folded, setFolded] = useState(false);
  const inboxSent = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const next = await readGuide();
      if (next) setGuide(next);
    } catch {
      /* the guide is optional garnish; try again on the next tick */
    }
  }, []);

  const send = useCallback(async (action: "dismiss" | "inbox-opened") => {
    try {
      const next = await readGuide({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (next) setGuide(next);
    } catch {
      /* a failed write is retried by the next trigger */
    }
  }, []);

  // Stay current: on every page change, when a turn finishes, and on a slow
  // timer for actions taken on pages that do not announce themselves.
  useEffect(() => {
    if (guide) reportSingleplayerGuideOffered(guide.offered);
  }, [guide]);
  const active = eligible && guide?.active !== false;
  useEffect(() => {
    if (!active) return;
    void refresh();
  }, [active, pathname, refresh]);
  useEffect(() => {
    if (!active) return;
    const onTurn = () => void refresh();
    window.addEventListener("ahd:turn-complete", onTurn);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => {
      window.removeEventListener("ahd:turn-complete", onTurn);
      window.clearInterval(timer);
    };
  }, [active, refresh]);

  // The inbox step is a page visit, recorded once on the world.
  const inboxDone = guide?.steps.find((s) => s.id === "inbox")?.done ?? true;
  useEffect(() => {
    if (!guide?.active || inboxDone || inboxSent.current) return;
    if (pathname !== "/notifications" && !pathname.startsWith("/notifications/")) return;
    inboxSent.current = true;
    void send("inbox-opened");
  }, [guide?.active, inboxDone, pathname, send]);

  if (!eligible || !guide?.active || guide.steps.length === 0) return null;

  const doneCount = guide.steps.filter((s) => s.done).length;
  const allDone = doneCount === guide.steps.length;
  const next = guide.steps.find((s) => !s.done);
  const onNextPage = next ? pathname === next.href || pathname.startsWith(`${next.href}/`) : false;

  return (
    <aside
      aria-label={t("region")}
      className="fixed bottom-[max(3.5rem,var(--status-bar-height,0px),var(--mobile-dock-height,0px))] left-3 z-40 w-[min(20rem,calc(100vw-1.5rem))] rounded border border-card-border bg-card text-sm shadow-lg"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("title")}</h2>
          <p className="text-xs text-muted">
            {t("progress", { done: doneCount, total: guide.steps.length })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFolded((v) => !v)}
          aria-expanded={!folded}
          className="rounded border border-card-border px-2 py-1 text-xs text-muted transition hover:text-foreground"
        >
          {folded ? t("show") : t("hide")}
        </button>
      </div>

      {folded ? null : (
        <div className="border-t border-card-border px-3 py-2">
          <ol className="space-y-1">
            {guide.steps.map((step) => {
              const current = step.id === next?.id;
              return (
                <li key={step.id} className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                      step.done
                        ? "border-primary bg-primary text-white"
                        : current
                          ? "border-primary text-primary"
                          : "border-card-border text-muted"
                    }`}
                  >
                    {step.done ? "✓" : ""}
                  </span>
                  <span
                    className={
                      step.done ? "text-muted line-through" : current ? "font-medium" : "text-muted"
                    }
                  >
                    {t(`steps.${step.id}.title`)}
                    {step.done ? <span className="sr-only"> ({t("done")})</span> : null}
                  </span>
                </li>
              );
            })}
          </ol>

          {next ? (
            <div className="mt-3 rounded border border-card-border bg-card-muted p-2">
              <p className="text-xs">
                {t(`steps.${next.id}.body`, {
                  funds: `₳${Math.round(guide.funds ?? 0).toLocaleString()}`,
                  actions: guide.actions ?? 0,
                })}
              </p>
              {LINK_STEPS.has(next.id) && !onNextPage ? (
                <Link
                  href={next.href}
                  className="mt-2 inline-flex rounded bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary/90"
                >
                  {t(`steps.${next.id}.action`)}
                </Link>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-xs">{t("allDone")}</p>
          )}

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => void send("dismiss")}
              className="rounded border border-card-border px-2 py-1 text-xs text-muted transition hover:text-foreground"
            >
              {allDone ? t("close") : t("skip")}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
