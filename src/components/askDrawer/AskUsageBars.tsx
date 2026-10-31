"use client";

import { useEffect, useState } from "react";
import {
  askEnergy,
  type AskEnergyView,
  type AskUpgradeOffer,
  type AskUsage,
} from "@/components/askDrawer/askDrawerApi";

function resetIn(resetAt: number, now: number): string {
  const mins = Math.max(0, Math.round((resetAt - now) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

function refillDay(resetAt: number): string {
  return new Date(resetAt).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

function aboutLeft(view: AskEnergyView): string {
  const n = view.typicalLeft;
  return `about ${n} ${n === 1 ? "question" : "questions"} left today`;
}

/** The week line, or null on an Ask server without a weekly cap. */
export function weeklyLine(view: AskEnergyView): string | null {
  if (!view.weekly) return null;
  return `This week: ${view.weekly.percentLeft}% left, refills ${refillDay(view.weekly.resetAt)}`;
}

/** Today's energy and this week's, the same bar the Ask app shows in its sidebar. */
export function AskUsageBars({
  usage,
  planLabel,
  upgrade,
  now: fixedNow,
}: {
  usage: AskUsage | null;
  planLabel: string | null;
  upgrade: AskUpgradeOffer | null;
  now?: number;
}) {
  const [clock, setClock] = useState<number | null>(null);
  useEffect(() => {
    if (fixedNow !== undefined) return;
    const tick = () => setClock(Date.now());
    tick();
    const timer = window.setInterval(tick, 60000);
    return () => window.clearInterval(timer);
  }, [fixedNow]);
  const now = fixedNow ?? clock;

  if (!usage) {
    return <div className="h-[52px] animate-pulse rounded-lg bg-card-elevated/50" aria-hidden />;
  }
  const view = askEnergy(usage);
  const left = view.daily.percentLeft;
  const week = weeklyLine(view);
  return (
    <div className="space-y-1.5">
      <div>
        <div className="mb-1 flex justify-between text-[11px] text-muted">
          <span>Energy</span>
          <span>
            <b className="font-semibold text-foreground">{left}%</b> left, {aboutLeft(view)}
          </span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-card-elevated"
          role="progressbar"
          aria-label="Energy left today"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={left}
        >
          <i
            className={`block h-full rounded-full ${left <= 20 ? "bg-amber-400" : "bg-primary"}`}
            style={{ width: `${left}%` }}
          />
        </div>
      </div>
      {week && view.weekly && (
        <div className="flex items-center gap-2 text-[10px] text-muted">
          <span className="h-0.5 w-12 overflow-hidden rounded-full bg-card-elevated" aria-hidden>
            <i
              className="block h-full rounded-full bg-primary/60"
              style={{ width: `${view.weekly.percentLeft}%` }}
            />
          </span>
          <span>{week}</span>
        </div>
      )}
      <div className="flex items-center justify-between text-[10px] text-muted">
        <span>
          {planLabel ? `${planLabel} plan` : ""}
          {planLabel && now !== null ? " · " : ""}
          {now !== null ? `Refills in ${resetIn(view.daily.resetAt, now)}` : ""}
        </span>
        {upgrade && upgrade.tiers.length > 0 && (
          <a
            href={upgrade.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            Get more
          </a>
        )}
      </div>
    </div>
  );
}

/** One quiet line under the composer. Clicking it opens the full bars. */
export function AskUsageLine({
  usage,
  open,
  onToggle,
}: {
  usage: AskUsage | null;
  open: boolean;
  onToggle: () => void;
}) {
  if (!usage) return <div className="h-4" aria-hidden />;
  const view = askEnergy(usage);
  const left = view.daily.percentLeft;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center gap-2 text-[11px] text-muted hover:text-foreground"
    >
      <span className="h-1 w-12 overflow-hidden rounded-full bg-card-elevated" aria-hidden>
        <i
          className={`block h-full rounded-full ${left <= 20 ? "bg-amber-400" : "bg-primary"}`}
          style={{ width: `${left}%` }}
        />
      </span>
      <span>
        Energy <b className="font-semibold text-foreground">{left}%</b>, {aboutLeft(view)}
      </span>
      <span className="ml-auto">{open ? "Hide" : "Usage"}</span>
    </button>
  );
}
