"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ChamberFloorWidgetData, FloorVote } from "@/lib/sidebarWidgets/data/chamberFloor";
import { Empty } from "./shared";

const VOTE_TONE: Record<FloorVote, string> = {
  for: "text-success",
  against: "text-error",
  abstain: "text-muted",
};

export function ChamberFloorBody({
  data,
  compact,
  onNavigate,
}: {
  data: ChamberFloorWidgetData;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav.widgets.chamberFloor");
  if (data.bills.length === 0) return <Empty>{t("empty")}</Empty>;
  const voteLabel: Record<FloorVote, string> = {
    for: t("for"),
    against: t("against"),
    abstain: t("abstain"),
  };
  const shown = data.bills.slice(0, compact ? 4 : 6);
  const more = data.total - shown.length;
  return (
    <div className="space-y-1">
      <ul className="space-y-0.5">
        {shown.map((bill) => (
          <li key={bill.id}>
            <Link
              href={`/congress/bills/${bill.id}`}
              onClick={onNavigate}
              className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-white/5"
            >
              <span className="min-w-0 flex-1 truncate text-foreground">{bill.title}</span>
              {bill.turnsLeft !== null && (
                <span className="shrink-0 tabular-nums text-muted">
                  {t("turnsLeft", { turns: bill.turnsLeft })}
                </span>
              )}
              <span
                className={`w-16 shrink-0 text-right font-semibold ${bill.vote ? VOTE_TONE[bill.vote] : "text-warning"}`}
              >
                {bill.vote ? voteLabel[bill.vote] : t("notVoted")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="px-1 text-[11px] text-muted">{t("more", { count: more })}</p>}
    </div>
  );
}
