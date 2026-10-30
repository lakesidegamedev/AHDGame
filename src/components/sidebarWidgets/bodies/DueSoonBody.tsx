"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { DueSoonItem, DueSoonWidgetData } from "@/lib/sidebarWidgets/dueSoon/types";

const HOUR_MS = 3_600_000;

/** Turns left for turn-based rows, else whole hours left; at least one when still open. */
export function dueSoonRemaining(
  item: Pick<DueSoonItem, "dueTurn" | "dueAt">,
  currentTurn: number,
  now: number
): { unit: "turns" | "hours"; count: number } | null {
  if (item.dueTurn !== null)
    return { unit: "turns", count: Math.max(1, item.dueTurn - currentTurn) };
  if (item.dueAt === null) return null;
  const ms = Date.parse(item.dueAt) - now;
  return Number.isNaN(ms) ? null : { unit: "hours", count: Math.max(0, Math.floor(ms / HOUR_MS)) };
}

function Countdown({
  item,
  currentTurn,
  now,
}: {
  item: DueSoonItem;
  currentTurn: number;
  now: number;
}) {
  const t = useTranslations("nav.widgets.dueSoon");
  const remaining = dueSoonRemaining(item, currentTurn, now);
  if (!remaining) return null;
  const urgent = remaining.unit === "turns" ? remaining.count <= 1 : remaining.count < 2;
  const text =
    remaining.unit === "turns"
      ? t("turnsLeft", { count: remaining.count })
      : remaining.count === 0
        ? t("closingNow")
        : t("hoursLeft", { count: remaining.count });
  return (
    <span
      className={`shrink-0 tabular-nums ${urgent ? "font-semibold text-warning" : "text-muted"}`}
    >
      {text}
    </span>
  );
}

export function DueSoonBody({
  data,
  compact,
  onNavigate,
}: {
  data: DueSoonWidgetData;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav.widgets.dueSoon");
  // Measured from when the server built the list, which refreshes with each poll.
  const now = Date.parse(data.asOf);
  if (data.items.length === 0) return <p className="text-xs text-muted">{t("empty")}</p>;
  const shown = data.items.slice(0, compact ? 5 : data.items.length);
  const more = data.total - shown.length;
  return (
    <div className="space-y-1">
      <ul className="space-y-0.5">
        {shown.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className="flex items-start gap-2 rounded px-1 py-1 text-xs hover:bg-white/5"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] text-muted">
                  {t(`kinds.${item.kind}`)}
                  {item.position && ` · ${t(`positions.${item.position}`)}`}
                </span>
                <span className="block truncate text-foreground">{item.subject}</span>
              </span>
              <Countdown item={item} currentTurn={data.currentTurn} now={now} />
            </Link>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="px-1 text-[11px] text-muted">{t("more", { count: more })}</p>}
    </div>
  );
}
