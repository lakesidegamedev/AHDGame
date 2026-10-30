"use client";

import React, { type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PixelNavIcon } from "@/components/navbar/PixelNavIcon";
import type { PixelNavIconName } from "@/components/navbar/PixelNavIcon";
import { Sparkline } from "@/components/statusbar/Sparkline";
import { CURRENCY_SYMBOLS, type CurrencyCode } from "@/lib/constants/currencyCodes";
import {
  formatCompactNumber,
  formatLocalAmount,
  formatSharePrice,
} from "@/lib/utils/formattersCore";
import { parseWidgetKey, type WidgetId } from "@/lib/sidebarWidgets/widgetCatalog";
import type { KeirPetWidgetData } from "@/lib/sidebarWidgets/keirPetShared";
import { KeirPetBody } from "./KeirPetBody";
import type {
  MyCompanyWidgetData,
  StaffQueuesWidgetData,
  StockTickerWidgetData,
} from "@/lib/sidebarWidgets/widgetData";

export const WIDGET_ICONS: Record<WidgetId, PixelNavIconName> = {
  keirPet: "star",
  myCompany: "briefcase",
  stockTicker: "chart",
  staffQueues: "gear",
};

function money(amount: number, code: CurrencyCode | null): string {
  return code ? formatLocalAmount(amount, code) : formatCompactNumber(amount);
}

function price(amount: number, code: CurrencyCode | null): string {
  return formatSharePrice(amount, code ? (CURRENCY_SYMBOLS[code] ?? "$") : "$");
}

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted">·</span>;
  const up = value >= 0;
  return (
    <span className={`tabular-nums ${up ? "text-success" : "text-error"}`}>
      {up ? "▲" : "▼"}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

interface FrameProps {
  icon: PixelNavIconName;
  title: string;
  href?: string;
  openLabel: string;
  compact: boolean;
  onNavigate?: () => void;
  children: ReactNode;
}

function Frame({ icon, title, href, openLabel, compact, onNavigate, children }: FrameProps) {
  return (
    <section
      className={`rounded-lg border border-card-border bg-card ${compact ? "p-3" : "p-3.5"}`}
      aria-label={title}
    >
      <header className="mb-2 flex items-center gap-2">
        <PixelNavIcon name={icon} className="h-4 w-4 shrink-0 text-muted" />
        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-fg-2">
          {title}
        </h3>
        {href && (
          <Link
            href={href}
            onClick={onNavigate}
            className="shrink-0 text-xs font-medium text-muted hover:text-foreground hover:underline"
          >
            {openLabel}
            <span aria-hidden="true"> ›</span>
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed text-muted">{children}</p>;
}

function MyCompanyBody({ data, compact }: { data: MyCompanyWidgetData; compact: boolean }) {
  const t = useTranslations("nav.widgets.myCompany");
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
      {!compact && data.cashSeries.length > 1 && (
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
          <span>{t("cashTrend")}</span>
          <Sparkline data={data.cashSeries} width={120} height={22} />
        </div>
      )}
    </div>
  );
}

function TickerBody({
  data,
  compact,
  onNavigate,
}: {
  data: StockTickerWidgetData;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav.widgets.stockTicker");
  if (data.rows.length === 0) return <Empty>{t("empty")}</Empty>;
  return (
    <ul className="space-y-0.5">
      {data.rows.slice(0, compact ? 5 : 8).map((row) => (
        <li key={row.sequentialId}>
          <Link
            href={`/corporation/${row.sequentialId}`}
            onClick={onNavigate}
            className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-white/5"
          >
            <span className="w-14 shrink-0 truncate font-semibold text-foreground">
              {row.ticker ?? row.name}
            </span>
            {compact ? (
              <span className="flex-1" />
            ) : (
              <span className="min-w-0 flex-1 truncate text-muted">
                {row.ticker ? row.name : ""}
              </span>
            )}
            <span className="shrink-0 tabular-nums text-foreground">
              {price(row.sharePrice, row.currencyCode)}
            </span>
            <span className="w-14 shrink-0 text-right">
              <Change value={row.change} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function StaffBody({ data, onNavigate }: { data: StaffQueuesWidgetData; onNavigate?: () => void }) {
  const t = useTranslations("nav.widgets.staffQueues");
  const rows = [
    {
      id: "wiki",
      label: t("wikiReview"),
      count: data.wikiReview,
      href: data.admin ? "/admin?tab=content&sub=wiki-review" : "/moderator?tab=content",
    },
    {
      id: "alts",
      label: t("altClusters"),
      count: data.altClusters,
      href: data.admin ? "/admin?tab=players&sub=alts" : "/moderator?tab=players",
    },
    {
      id: "reports",
      label: t("playerReports"),
      count: data.playerReports,
      href: data.admin ? "/admin?tab=support&sub=player-reports" : "/moderator?tab=content",
    },
  ];
  return (
    <ul className="space-y-0.5">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={row.href}
            onClick={onNavigate}
            className="flex items-center justify-between gap-2 rounded px-1 py-1.5 text-xs hover:bg-white/5"
          >
            <span className="text-foreground">{row.label}</span>
            <span
              className={`min-w-6 rounded-full px-1.5 text-center font-semibold tabular-nums ${row.count > 0 ? "bg-primary/15 text-primary" : "text-muted"}`}
            >
              {row.count}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Count shown on the collapsed tray rail, or 0 for widgets that have none. */
export function widgetBadge(widgetKey: string, data: unknown): number {
  const parsed = parseWidgetKey(widgetKey);
  if (parsed?.id === "staffQueues" && data) {
    const queues = data as StaffQueuesWidgetData;
    return queues.wikiReview + queues.altClusters + queues.playerReports;
  }
  return 0;
}

export interface SidebarWidgetProps {
  /** The placed key, e.g. `stockTicker:nation`. */
  widgetKey: string;
  data: unknown;
  loaded: boolean;
  /** Tighter layout for desktop menu panels. */
  compact?: boolean;
  /** Ticker scope label when the key resolved to the viewed nation's exchange. */
  exchangeLabel?: string;
  onNavigate?: () => void;
}

export function SidebarWidget({
  widgetKey,
  data,
  loaded,
  compact = false,
  exchangeLabel,
  onNavigate,
}: SidebarWidgetProps) {
  const t = useTranslations("nav.widgets");
  const parsed = parseWidgetKey(widgetKey);
  if (!parsed) return null;
  const common = { compact, onNavigate, openLabel: t("open"), icon: WIDGET_ICONS[parsed.id] };
  const pending = !loaded ? (
    <div className="h-12 animate-pulse rounded bg-white/5" aria-busy="true" />
  ) : null;

  switch (parsed.id) {
    case "keirPet": {
      const pet = data as KeirPetWidgetData | null;
      return (
        <Frame {...common} title={t("keirPet.title")}>
          {pending ??
            (pet ? (
              <KeirPetBody data={pet} compact={compact} onNavigate={onNavigate} />
            ) : (
              <Empty>{t("unavailable")}</Empty>
            ))}
        </Frame>
      );
    }
    case "myCompany": {
      const company = data as MyCompanyWidgetData | null;
      return (
        <Frame
          {...common}
          title={t("myCompany.title")}
          href={company?.sequentialId ? `/corporation/${company.sequentialId}` : undefined}
        >
          {pending ??
            (company ? (
              <MyCompanyBody data={company} compact={compact} />
            ) : (
              <Empty>{t("myCompany.empty")}</Empty>
            ))}
        </Frame>
      );
    }
    case "stockTicker": {
      const ticker = data as StockTickerWidgetData | null;
      const title = ticker?.exchangeName ?? exchangeLabel ?? t("stockTicker.title");
      return (
        <Frame
          {...common}
          title={title}
          href={ticker ? `/stockmarket/${ticker.exchange}` : undefined}
        >
          {pending ??
            (ticker ? (
              <TickerBody data={ticker} compact={compact} onNavigate={onNavigate} />
            ) : (
              <Empty>{t("stockTicker.empty")}</Empty>
            ))}
        </Frame>
      );
    }
    case "staffQueues": {
      const queues = data as StaffQueuesWidgetData | null;
      return (
        <Frame {...common} title={t("staffQueues.title")}>
          {pending ??
            (queues ? (
              <StaffBody data={queues} onNavigate={onNavigate} />
            ) : (
              <Empty>{t("unavailable")}</Empty>
            ))}
        </Frame>
      );
    }
  }
}
