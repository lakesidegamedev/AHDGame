"use client";

import { useTranslations } from "next-intl";
import type { MyRaceWidgetData } from "@/lib/sidebarWidgets/data/myRace";
import { Meter } from "../MiniCharts";
import { percent, Empty, WidgetLinks } from "./shared";

export function MyRaceBody({
  data,
  onNavigate,
}: {
  data: MyRaceWidgetData;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav.widgets.myRace");
  const timing =
    data.turnsLeft === null
      ? null
      : data.status === "upcoming"
        ? t("opensIn", { turns: data.turnsLeft })
        : t("closesIn", { turns: data.turnsLeft });
  // A tick at half the vote, where one seat is at stake.
  const majorityMark = data.mySeats === null ? 50 : undefined;
  const links = [
    { href: `/elections/${data.electionId}`, label: t("election") },
    ...(data.campaignId ? [{ href: `/campaign/${data.campaignId}`, label: t("campaign") }] : []),
  ];
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-semibold text-foreground">
          {data.region ? `${data.office} · ${data.region}` : data.office}
        </span>
        {timing && <span className="shrink-0 text-xs text-muted">{timing}</span>}
      </div>
      {data.myPct === null ? (
        <Empty>{t("noVotes")}</Empty>
      ) : (
        <div className="space-y-2 text-xs">
          <ShareRow
            label={t("you")}
            pct={data.myPct}
            mark={majorityMark}
            fillClass="bg-secondary"
            strong
          />
          {data.leader && !data.leader.isMe && (
            <ShareRow
              label={data.leader.name || t("leader")}
              pct={data.leader.pct}
              mark={majorityMark}
              fillClass="bg-foreground/40"
            />
          )}
          <div className="flex justify-between gap-2 pt-0.5">
            {data.myRank !== null && (
              <span className={data.myRank === 1 ? "font-medium text-success" : "text-muted"}>
                {t("place")} {t("placeValue", { rank: data.myRank, count: data.candidates })}
              </span>
            )}
            {data.mySeats !== null && (
              <span className="text-muted">
                {t("seats")} <span className="tabular-nums text-foreground">{data.mySeats}</span>
              </span>
            )}
          </div>
        </div>
      )}
      <WidgetLinks links={links} onNavigate={onNavigate} />
    </div>
  );
}

function ShareRow({
  label,
  pct,
  mark,
  fillClass,
  strong = false,
}: {
  label: string;
  pct: number;
  mark?: number;
  fillClass: string;
  strong?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`truncate ${strong ? "font-medium text-foreground" : "text-muted"}`}>
          {label}
        </span>
        <span className="shrink-0 font-medium tabular-nums text-foreground">{percent(pct)}</span>
      </div>
      <Meter value={pct} label={`${label}: ${percent(pct)}`} mark={mark} fillClass={fillClass} />
    </div>
  );
}
