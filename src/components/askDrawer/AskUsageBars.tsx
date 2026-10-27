"use client";

import { useEffect, useState } from "react";
import type { AskUpgradeOffer, AskUsage } from "@/components/askDrawer/askDrawerApi";

function resetIn(resetAt: number, now: number): string {
  const mins = Math.max(0, Math.round((resetAt - now) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

function Bar({
  label,
  left,
  limit,
  tone,
}: {
  label: string;
  left: number;
  limit: number;
  tone: string;
}) {
  const used = Math.max(0, limit - left);
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-muted">
        <span>{label}</span>
        <span>
          <b className="font-semibold text-foreground">{Math.max(0, left)}</b> / {limit} left
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-card-elevated"
        role="progressbar"
        aria-label={`${label} used`}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
      >
        <i className={`block h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Today's Ask allowance, the same bars the Ask app shows in its sidebar. */
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
  const remainingFraction = usage.limit > 0 ? usage.remaining / usage.limit : 1;
  return (
    <div className="space-y-1.5">
      <Bar
        label="Questions"
        left={usage.remaining}
        limit={usage.limit}
        tone={remainingFraction <= 0.2 ? "bg-amber-400" : "bg-primary"}
      />
      <Bar
        label="Live data"
        left={usage.mcpRemaining}
        limit={usage.mcpLimit}
        tone="bg-emerald-400"
      />
      <div className="flex items-center justify-between text-[10px] text-muted">
        <span>
          {planLabel ? `${planLabel} plan` : ""}
          {planLabel && now !== null ? " · " : ""}
          {now !== null ? `Resets in ${resetIn(usage.resetAt, now)}` : ""}
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
  const low = usage.limit > 0 && usage.remaining / usage.limit <= 0.2;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center gap-2 text-[11px] text-muted hover:text-foreground"
    >
      <span className="h-1 w-12 overflow-hidden rounded-full bg-card-elevated" aria-hidden>
        <i
          className={`block h-full rounded-full ${low ? "bg-amber-400" : "bg-primary"}`}
          style={{
            width: `${usage.limit > 0 ? Math.min(100, (Math.max(0, usage.remaining) / usage.limit) * 100) : 0}%`,
          }}
        />
      </span>
      <span>
        <b className="font-semibold text-foreground">{Math.max(0, usage.remaining)}</b> of{" "}
        {usage.limit} questions left today
      </span>
      <span className="ml-auto">{open ? "Hide" : "Usage"}</span>
    </button>
  );
}
