"use client";

import { useTranslations } from "next-intl";
import type { MyRaceWidgetData } from "@/lib/sidebarWidgets/data/myRace";
import { percent, WidgetEmpty, WidgetLinks } from "./common";

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
        <WidgetEmpty>{t("noVotes")}</WidgetEmpty>
      ) : (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted">{t("you")}</dt>
          <dd className="text-right font-medium tabular-nums text-foreground">
            {percent(data.myPct)}
          </dd>
          {data.myRank !== null && (
            <>
              <dt className="text-muted">{t("place")}</dt>
              <dd
                className={`text-right font-medium tabular-nums ${data.myRank === 1 ? "text-success" : "text-foreground"}`}
              >
                {t("placeValue", { rank: data.myRank, count: data.candidates })}
              </dd>
            </>
          )}
          {data.leader && !data.leader.isMe && (
            <>
              <dt className="text-muted">{t("leader")}</dt>
              <dd className="truncate text-right tabular-nums text-foreground">
                {data.leader.name ? `${data.leader.name} · ` : ""}
                {percent(data.leader.pct)}
              </dd>
            </>
          )}
          {data.mySeats !== null && (
            <>
              <dt className="text-muted">{t("seats")}</dt>
              <dd className="text-right tabular-nums text-foreground">{data.mySeats}</dd>
            </>
          )}
        </dl>
      )}
      <WidgetLinks links={links} onNavigate={onNavigate} />
    </div>
  );
}
