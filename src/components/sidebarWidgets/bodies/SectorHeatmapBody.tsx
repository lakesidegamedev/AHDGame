"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCurrency } from "@/contexts/CurrencyContext";
import { treemapLayout } from "@/lib/sidebarWidgets/treemap";
import {
  OTHER_SECTOR,
  type SectorHeatmapWidgetData,
} from "@/lib/sidebarWidgets/data/sectorHeatmap";
import { heatColor } from "../MiniCharts";
import { Empty } from "./shared";

function signed(change: number): string {
  return `${change >= 0 ? "▲" : "▼"}${Math.abs(change).toFixed(1)}%`;
}

export function SectorHeatmapBody({
  data,
  compact,
  onNavigate,
}: {
  data: SectorHeatmapWidgetData;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav.widgets.sectorHeatmap");
  const { formatAmount } = useCurrency();
  if (data.tiles.length === 0) return <Empty>{t("empty")}</Empty>;
  const height = compact ? 112 : 148;
  const rects = treemapLayout(
    data.tiles.map((tile) => tile.marketCap),
    // Width over height of the box, so splits follow its longer side.
    compact ? 234 / height : 350 / height
  );
  const href = `/stockmarket/${data.exchange}`;
  return (
    <div className="space-y-1.5">
      <ul className="relative w-full" style={{ height }}>
        {data.tiles.map((tile, i) => {
          const rect = rects[i]!;
          const label = tile.type === OTHER_SECTOR ? t("other") : tile.label;
          const summary = t("tile", {
            sector: label,
            change: signed(tile.change),
            cap: formatAmount(tile.marketCap),
            count: tile.listings,
          });
          // Room for text depends on the tile's share of the box.
          const roomy = rect.w * rect.h > 0.05 && rect.w > 0.2;
          return (
            <li
              key={tile.type}
              className="absolute p-px"
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.w * 100}%`,
                height: `${rect.h * 100}%`,
              }}
            >
              <Link
                href={href}
                onClick={onNavigate}
                title={summary}
                aria-label={summary}
                className="flex h-full w-full flex-col justify-between overflow-hidden rounded px-1.5 py-1 text-[11px] leading-tight text-foreground outline-offset-1 hover:outline hover:outline-1 hover:outline-foreground/40"
                style={{ background: heatColor(tile.change) }}
              >
                {roomy && <span className="truncate font-medium">{label}</span>}
                {rect.w > 0.12 && rect.h > 0.14 && (
                  <span className="tabular-nums">{signed(tile.change)}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-1.5 text-[10px] text-muted" aria-hidden="true">
        <span>{t("legendDown")}</span>
        <span
          className="h-1.5 flex-1 rounded-full"
          style={{
            background: `linear-gradient(to right, ${heatColor(-5)}, ${heatColor(0)}, ${heatColor(5)})`,
          }}
        />
        <span>{t("legendUp")}</span>
      </div>
      {!compact && <p className="text-[10px] text-muted">{t("hint")}</p>}
    </div>
  );
}
