"use client";

import React, { type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PixelNavIcon } from "@/components/navbar/PixelNavIcon";
import type { PixelNavIconName } from "@/components/navbar/PixelNavIcon";
import { parseWidgetKey, type WidgetId } from "@/lib/sidebarWidgets/widgetCatalog";
import type { KeirPetWidgetData } from "@/lib/sidebarWidgets/keirPetShared";
import { KeirPetBody } from "./KeirPetBody";
import type {
  MyCompanyWidgetData,
  StaffQueuesWidgetData,
  StockTickerWidgetData,
} from "@/lib/sidebarWidgets/widgetData";
import type { WatchlistWidgetData } from "@/lib/sidebarWidgets/data/watchlist";
import { WatchlistBody } from "./bodies/WatchlistBody";
import type { DueSoonWidgetData } from "@/lib/sidebarWidgets/dueSoon/types";
import { DueSoonBody } from "./bodies/DueSoonBody";
import type { ChamberFloorWidgetData } from "@/lib/sidebarWidgets/data/chamberFloor";
import type { MyRaceWidgetData } from "@/lib/sidebarWidgets/data/myRace";
import type { OfficeDashboardWidgetData } from "@/lib/sidebarWidgets/data/officeDashboard";
import type { SinceAwayWidgetData } from "@/lib/sidebarWidgets/data/sinceAway";
import { legislatureUrl } from "@/lib/urls";
import { ChamberFloorBody } from "./bodies/ChamberFloorBody";
import { MyRaceBody } from "./bodies/MyRaceBody";
import { OfficeDashboardBody, officeDashboardHref } from "./bodies/OfficeDashboardBody";
import { SinceAwayBody } from "./bodies/SinceAwayBody";
import type { SectorHeatmapWidgetData } from "@/lib/sidebarWidgets/data/sectorHeatmap";
import type { NetWorthWidgetData } from "@/lib/sidebarWidgets/data/netWorth";
import type { CommodityBoardWidgetData } from "@/lib/sidebarWidgets/data/commodityBoard";
import { Empty } from "./bodies/shared";
import { MyCompanyBody } from "./bodies/MyCompanyBody";
import { TickerBody } from "./bodies/TickerBody";
import { SectorHeatmapBody } from "./bodies/SectorHeatmapBody";
import { NetWorthBody } from "./bodies/NetWorthBody";
import { CommodityBoardBody } from "./bodies/CommodityBoardBody";

export const WIDGET_ICONS: Record<WidgetId, PixelNavIconName> = {
  keirPet: "star",
  dueSoon: "bell",
  myCompany: "briefcase",
  stockTicker: "chart",
  sectorHeatmap: "chart",
  netWorth: "bill",
  commodityBoard: "scales",
  staffQueues: "gear",
  watchlist: "star",
  myRace: "vote",
  chamberFloor: "bill",
  officeDashboard: "capitol",
  sinceAway: "bell",
};

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
  if (parsed?.id === "dueSoon" && data) return (data as DueSoonWidgetData).total;
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
    case "dueSoon": {
      const due = data as DueSoonWidgetData | null;
      return (
        <Frame {...common} title={t("dueSoon.title")}>
          {pending ??
            (due ? (
              <DueSoonBody data={due} compact={compact} onNavigate={onNavigate} />
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
    case "sectorHeatmap": {
      const heatmap = data as SectorHeatmapWidgetData | null;
      const scope = heatmap?.exchangeName ?? exchangeLabel;
      return (
        <Frame
          {...common}
          title={scope ? `${t("sectorHeatmap.title")} · ${scope}` : t("sectorHeatmap.title")}
          href={heatmap ? `/stockmarket/${heatmap.exchange}` : undefined}
        >
          {pending ??
            (heatmap ? (
              <SectorHeatmapBody data={heatmap} compact={compact} onNavigate={onNavigate} />
            ) : (
              <Empty>{t("sectorHeatmap.empty")}</Empty>
            ))}
        </Frame>
      );
    }
    case "netWorth": {
      const wealth = data as NetWorthWidgetData | null;
      return (
        <Frame {...common} title={t("netWorth.title")} href="/portfolio">
          {pending ??
            (wealth ? (
              <NetWorthBody data={wealth} compact={compact} />
            ) : (
              <Empty>{t("netWorth.empty")}</Empty>
            ))}
        </Frame>
      );
    }
    case "commodityBoard": {
      const board = data as CommodityBoardWidgetData | null;
      return (
        <Frame {...common} title={t("commodityBoard.title")} href="/market?tab=commodities">
          {pending ??
            (board ? (
              <CommodityBoardBody data={board} compact={compact} onNavigate={onNavigate} />
            ) : (
              <Empty>{t("commodityBoard.empty")}</Empty>
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
    case "watchlist": {
      const watchlist = data as WatchlistWidgetData | null;
      return (
        <Frame {...common} title={t("watchlist.title")}>
          {pending ??
            (watchlist ? (
              <WatchlistBody data={watchlist} compact={compact} onNavigate={onNavigate} />
            ) : (
              <Empty>{t("unavailable")}</Empty>
            ))}
        </Frame>
      );
    }
    case "myRace": {
      const race = data as MyRaceWidgetData | null;
      return (
        <Frame
          {...common}
          title={t("myRace.title")}
          href={race ? `/elections/${race.electionId}` : undefined}
        >
          {pending ??
            (race ? (
              <MyRaceBody data={race} onNavigate={onNavigate} />
            ) : (
              <Empty>{t("myRace.empty")}</Empty>
            ))}
        </Frame>
      );
    }
    case "chamberFloor": {
      const floor = data as ChamberFloorWidgetData | null;
      return (
        <Frame
          {...common}
          title={floor?.chamber || t("chamberFloor.title")}
          href={floor ? legislatureUrl(floor.countryId) : undefined}
        >
          {pending ??
            (floor ? (
              <ChamberFloorBody data={floor} compact={compact} onNavigate={onNavigate} />
            ) : (
              <Empty>{t("unavailable")}</Empty>
            ))}
        </Frame>
      );
    }
    case "officeDashboard": {
      const office = data as OfficeDashboardWidgetData | null;
      return (
        <Frame
          {...common}
          title={t("officeDashboard.title")}
          href={office ? officeDashboardHref(office) : undefined}
        >
          {pending ??
            (office ? (
              <OfficeDashboardBody data={office} onNavigate={onNavigate} />
            ) : (
              <Empty>{t("unavailable")}</Empty>
            ))}
        </Frame>
      );
    }
    case "sinceAway": {
      const away = data as SinceAwayWidgetData | null;
      return (
        <Frame {...common} title={t("sinceAway.title")} href="/notifications">
          {pending ??
            (away ? (
              <SinceAwayBody data={away} onNavigate={onNavigate} />
            ) : (
              <Empty>{t("unavailable")}</Empty>
            ))}
        </Frame>
      );
    }
  }
}
