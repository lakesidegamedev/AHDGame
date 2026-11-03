"use client";

import { useTranslations } from "next-intl";
import type { MyCompanyWidgetData } from "@/lib/sidebarWidgets/widgetData";
import { BarStrip, TrendSparkline } from "../MiniCharts";
import { Change, money, price } from "./shared";

function TrendRow({
  swatch,
  name,
  values,
  latest,
  format,
  label,
}: {
  swatch: string;
  name: string;
  values: number[];
  latest: string;
  format: (value: number) => string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className={`h-0.5 w-3 shrink-0 rounded-full bg-current ${swatch}`} aria-hidden="true" />
      <span className="w-20 shrink-0 truncate text-muted">{name}</span>
      <TrendSparkline
        values={values}
        label={label}
        width={96}
        height={20}
        colorClass={swatch}
        format={format}
      />
      <span className="ml-auto shrink-0 tabular-nums text-foreground">{latest}</span>
    </div>
  );
}

export function MyCompanyBody({ data, compact }: { data: MyCompanyWidgetData; compact: boolean }) {
  const t = useTranslations("nav.widgets.myCompany");
  const count = Math.max(data.cashSeries.length, data.incomeSeries.length);
  const showSharePrice = !data.isPrivate && data.sharePriceSeries.length > 1;
  const showCash = data.cashSeries.length > 1;
  const showIncome = data.incomeSeries.length > 1;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-semibold text-foreground">{data.name}</span>
        {data.ticker && <span className="shrink-0 text-xs text-muted">{data.ticker}</span>}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">{t("cash")}</dt>
        <dd className="text-right font-medium tabular-nums text-foreground">
          {money(data.cash, data.currencyCode)}
        </dd>
        {!data.isPrivate && (
          <>
            <dt className="text-muted">{t("sharePrice")}</dt>
            <dd className="text-right font-medium tabular-nums text-foreground">
              {price(data.sharePrice, data.currencyCode)} <Change value={data.sharePriceChange} />
            </dd>
          </>
        )}
        {data.revenue !== null && (
          <>
            <dt className="text-muted">{t("revenue")}</dt>
            <dd className="text-right tabular-nums text-foreground">
              {money(data.revenue, data.currencyCode)}
            </dd>
          </>
        )}
        {data.income !== null && (
          <>
            <dt className="text-muted">{t("income")}</dt>
            <dd
              className={`text-right tabular-nums ${data.income < 0 ? "text-error" : "text-foreground"}`}
            >
              {money(data.income, data.currencyCode)}
            </dd>
          </>
        )}
      </dl>
      {!compact && (showSharePrice || showCash || showIncome) && (
        <figure className="space-y-1.5 border-t border-card-border pt-2">
          <figcaption className="text-[11px] font-medium text-fg-2">
            {t("recentTurns", { count })}
          </figcaption>
          {showSharePrice && (
            <TrendRow
              swatch="text-info"
              name={t("sharePrice")}
              values={data.sharePriceSeries}
              latest={price(data.sharePrice, data.currencyCode)}
              format={(value) => price(value, data.currencyCode)}
              label={t("trendLabel", {
                name: t("sharePrice"),
                count: data.sharePriceSeries.length,
              })}
            />
          )}
          {showCash && (
            <TrendRow
              swatch="text-gold"
              name={t("cash")}
              values={data.cashSeries}
              latest={money(data.cash, data.currencyCode)}
              format={(value) => money(value, data.currencyCode)}
              label={t("trendLabel", { name: t("cash"), count: data.cashSeries.length })}
            />
          )}
          {showIncome && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="w-[5.75rem] shrink-0 truncate text-muted">{t("incomeTrend")}</span>
              <div className="min-w-0 flex-1">
                <BarStrip
                  values={data.incomeSeries}
                  label={t("trendLabel", {
                    name: t("incomeTrend"),
                    count: data.incomeSeries.length,
                  })}
                  width={160}
                  height={22}
                  format={(value) => money(value, data.currencyCode)}
                />
              </div>
            </div>
          )}
        </figure>
      )}
    </div>
  );
}
