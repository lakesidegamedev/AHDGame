"use client";

import { useTranslations } from "next-intl";
import type { OfficeDashboardWidgetData } from "@/lib/sidebarWidgets/data/officeDashboard";
import { approvalUrl, budgetUrl, countryUrl, economyUrl, regionUrl } from "@/lib/urls";
import { Meter } from "../MiniCharts";
import { money, percent, toneClass, WidgetLinks } from "./shared";

/** The place the office runs: its region page or its nation page. */
export function officeDashboardHref(data: OfficeDashboardWidgetData): string {
  return data.stateId ? regionUrl(data.countryId, data.stateId) : countryUrl(data.countryId);
}

export function OfficeDashboardBody({
  data,
  onNavigate,
}: {
  data: OfficeDashboardWidgetData;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav.widgets.officeDashboard");
  const region = data.stateId ? regionUrl(data.countryId, data.stateId) : null;
  const links = region
    ? [
        { href: `${region}/office`, label: t("office") },
        { href: `${region}?tab=economy&sub=sectors`, label: t("economy") },
        { href: `${region}?tab=economy&sub=budget`, label: t("budget") },
      ]
    : [
        { href: approvalUrl(data.countryId), label: t("approval") },
        { href: economyUrl(data.countryId), label: t("economy") },
        { href: budgetUrl(data.countryId), label: t("budget") },
      ];
  const stats = [
    {
      id: "budget",
      label: t("budgetBalance"),
      value: data.budgetBalance === null ? null : money(data.budgetBalance, data.currencyCode),
      tone: toneClass(data.budgetBalance),
    },
    {
      id: "growth",
      label: t("growth"),
      value:
        data.gdpGrowth === null
          ? null
          : `${data.gdpGrowth > 0 ? "▲" : data.gdpGrowth < 0 ? "▼" : ""}${percent(Math.abs(data.gdpGrowth))}`,
      tone: toneClass(data.gdpGrowth),
    },
    {
      id: "unemployment",
      label: t("unemployment"),
      value: data.unemployment === null ? null : percent(data.unemployment),
      tone: "text-foreground",
    },
  ].filter((stat) => stat.value !== null);
  return (
    <div className="space-y-2.5">
      <span className="block truncate text-sm font-semibold text-foreground">{data.name}</span>
      {data.approval !== null && (
        <div className="space-y-1 text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-muted">{t("approval")}</span>
            <span className="font-semibold tabular-nums text-foreground">
              {percent(data.approval)}
            </span>
          </div>
          <Meter
            value={data.approval}
            mark={50}
            label={`${t("approval")}: ${percent(data.approval)}`}
          />
        </div>
      )}
      {stats.length > 0 && (
        <dl className="grid grid-cols-3 gap-1.5">
          {stats.map((stat) => (
            <div
              key={stat.id}
              className="min-w-0 rounded-md border border-card-border bg-background/40 px-2 py-1.5"
            >
              <dt className="truncate text-[10px] text-muted">{stat.label}</dt>
              <dd className={`truncate text-[13px] font-semibold tabular-nums ${stat.tone}`}>
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <WidgetLinks links={links} onNavigate={onNavigate} />
    </div>
  );
}
