"use client";

import { useTranslations } from "next-intl";
import type { OfficeDashboardWidgetData } from "@/lib/sidebarWidgets/data/officeDashboard";
import { approvalUrl, budgetUrl, countryUrl, economyUrl, regionUrl } from "@/lib/urls";
import { money, percent, toneClass, WidgetLinks } from "./common";

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
  const rows = [
    {
      id: "approval",
      label: t("approval"),
      value: data.approval === null ? null : percent(data.approval),
      tone: "text-foreground",
    },
    {
      id: "budget",
      label: t("budgetBalance"),
      value: data.budgetBalance === null ? null : money(data.budgetBalance, data.currencyCode),
      tone: toneClass(data.budgetBalance),
    },
    {
      id: "growth",
      label: t("growth"),
      value: data.gdpGrowth === null ? null : percent(data.gdpGrowth, true),
      tone: toneClass(data.gdpGrowth),
    },
    {
      id: "unemployment",
      label: t("unemployment"),
      value: data.unemployment === null ? null : percent(data.unemployment),
      tone: "text-foreground",
    },
  ].filter((row) => row.value !== null);
  return (
    <div className="space-y-2">
      <span className="block truncate text-sm font-semibold text-foreground">{data.name}</span>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {rows.map((row) => (
          <div key={row.id} className="contents">
            <dt className="text-muted">{row.label}</dt>
            <dd className={`text-right font-medium tabular-nums ${row.tone}`}>{row.value}</dd>
          </div>
        ))}
      </dl>
      <WidgetLinks links={links} onNavigate={onNavigate} />
    </div>
  );
}
