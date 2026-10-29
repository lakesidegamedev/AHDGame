"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { Activity, Clock, MessagesSquare, Newspaper, Siren, type LucideIcon } from "lucide-react";

/**
 * One panel on the Actions page for everything that is happening TO the
 * player: random events, election debates and crises. Each source keeps its
 * own fetch and renders `EventItem`s into this shell.
 *
 * The shell hides itself until at least one item is inside it, so a player
 * with nothing going on sees no empty box. Items sort themselves with CSS
 * `order` by status: decisions first, then ongoing situations, then recent
 * outcomes, regardless of which source answered first.
 */
export function EventsPanel({ children }: { children: ReactNode }) {
  return (
    <section
      aria-labelledby="actions-events-heading"
      className="hidden overflow-hidden rounded-xl border border-card-border bg-card has-[[data-event-item]]:block"
    >
      <header className="flex items-center gap-2.5 border-b border-card-border px-4 py-3 sm:px-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Activity className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="actions-events-heading" className="text-body-lg font-semibold text-foreground">
            Events
          </h2>
          <p className="text-body-sm text-muted">Crises, debates and events affecting you</p>
        </div>
      </header>
      <div className="flex flex-col gap-3 p-3 sm:p-4">{children}</div>
    </section>
  );
}

export type EventKind = "crisis" | "debate" | "event";
/** decision: waiting on the player. active: ongoing, nothing to choose. recent: settled. */
export type EventStatus = "decision" | "active" | "recent";

const KIND_META: Record<EventKind, { label: string; Icon: LucideIcon }> = {
  crisis: { label: "Crisis", Icon: Siren },
  debate: { label: "Debate", Icon: MessagesSquare },
  event: { label: "Event", Icon: Newspaper },
};

/** Default tone per kind, for rows that have no severity of their own. */
const KIND_TONE: Record<EventKind, "rose" | "sky" | "violet"> = {
  crisis: "rose",
  debate: "sky",
  event: "violet",
};

const ORDER: Record<EventStatus, string> = {
  decision: "order-1",
  active: "order-2",
  recent: "order-3",
};

/** Accent colors per tone: icon tile and kind label. */
export const EVENT_TONES = {
  rose: { tile: "bg-rose-500/15 text-rose-300 ring-rose-400/30", text: "text-rose-300" },
  amber: { tile: "bg-amber-500/15 text-amber-300 ring-amber-400/30", text: "text-amber-300" },
  zinc: { tile: "bg-zinc-400/15 text-zinc-300 ring-zinc-400/30", text: "text-zinc-300" },
  sky: { tile: "bg-sky-500/15 text-sky-300 ring-sky-400/30", text: "text-sky-300" },
  violet: { tile: "bg-violet-500/15 text-violet-300 ring-violet-400/30", text: "text-violet-300" },
} as const;
export type EventTone = keyof typeof EVENT_TONES;

interface EventItemProps {
  kind: EventKind;
  status: EventStatus;
  tone: EventTone;
  title: ReactNode;
  /** Small chips beside the kind label (scope, severity). */
  tags?: ReactNode;
  /** Top-right slot: countdown, dismiss. */
  aside?: ReactNode;
  /** Art for the header band. Kept short and dimmed so it sets the scene, not the size. */
  image?: string | null;
  /** Extra classes for the tile border (crisis severity). */
  className?: string;
  id?: string;
  children?: ReactNode;
}

/** A full tile: something live the player should read or answer. */
export function EventItem({
  kind,
  status,
  tone,
  title,
  tags,
  aside,
  image,
  className = "border-card-border",
  id,
  children,
}: EventItemProps) {
  const { label, Icon } = KIND_META[kind];
  const t = EVENT_TONES[tone];
  return (
    <article
      id={id}
      data-event-item={kind}
      className={`relative overflow-hidden rounded-lg border bg-background/40 ${ORDER[status]} ${className}`}
    >
      <div className="relative">
        {image && (
          <>
            <Image
              src={image}
              alt=""
              fill
              unoptimized
              className="object-cover object-center opacity-60"
            />
            <div
              className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/30"
              aria-hidden
            />
            <div
              className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-background/60 to-transparent"
              aria-hidden
            />
          </>
        )}
        <div
          className={`relative flex items-start justify-between gap-3 px-4 ${image ? "py-4" : "pt-3.5"}`}
        >
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 backdrop-blur-sm ${t.tile}`}
            >
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`text-body-xs font-semibold tracking-wider uppercase ${t.text}`}>
                  {label}
                </span>
                {status === "decision" && (
                  <span className="rounded-full bg-warning/15 px-2 py-0.5 text-body-xs font-semibold text-warning">
                    Your decision
                  </span>
                )}
                {tags}
              </div>
              <h3 className="mt-0.5 text-body-lg leading-snug font-semibold text-foreground">
                {title}
              </h3>
            </div>
          </div>
          {aside && <div className="flex shrink-0 flex-col items-end gap-1">{aside}</div>}
        </div>
      </div>
      {children && <div className="space-y-3 px-4 pt-3 pb-4">{children}</div>}
    </article>
  );
}

/** A one-line settled outcome: what happened last time, kept low-key. */
export function EventOutcomeRow({
  kind,
  title,
  outcome,
  outcomeTone = "neutral",
  detail,
  when,
  id,
}: {
  kind: EventKind;
  title: ReactNode;
  outcome: ReactNode;
  outcomeTone?: "good" | "bad" | "neutral";
  detail?: ReactNode;
  when?: ReactNode;
  id?: string;
}) {
  const { label, Icon } = KIND_META[kind];
  const pill =
    outcomeTone === "good"
      ? "bg-success/15 text-success"
      : outcomeTone === "bad"
        ? "bg-error/15 text-error"
        : "bg-card-elevated text-muted";
  return (
    <div
      id={id}
      data-event-item={kind}
      className={`flex items-start gap-3 rounded-lg border border-card-border/60 px-3 py-2.5 ${ORDER.recent}`}
    >
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${EVENT_TONES[KIND_TONE[kind]].tile}`}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-body-xs font-semibold tracking-wider text-muted uppercase">
            Recent {label.toLowerCase()}
          </span>
          {when && <span className="text-body-xs text-muted">· {when}</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-body font-medium text-foreground">{title}</span>
          <span className={`rounded-full px-2 py-0.5 text-body-sm font-semibold ${pill}`}>
            {outcome}
          </span>
        </div>
        {detail && <p className="mt-1 text-body-sm text-muted">{detail}</p>}
      </div>
    </div>
  );
}

/** Compact countdown chip for the top-right slot of an `EventItem`. */
export function Countdown({ label, value }: { label: string; value: string }) {
  return (
    <span
      title={`${label} ${value}`}
      className="inline-flex items-center gap-1 rounded-full bg-card-elevated px-2 py-0.5 text-body-sm font-semibold text-foreground tabular-nums"
    >
      <Clock className="h-3.5 w-3.5 text-warning" aria-hidden />
      <span className="sr-only">{label} </span>
      {value}
    </span>
  );
}
