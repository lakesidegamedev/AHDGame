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

/** Pixel size of the box the tiles share, for deciding which tiles have room for text. */
const BOX_WIDTH = { tray: 350, menu: 234 };
/** Tiles shown in a menu column; the rest fold into Other so labels stay readable. */
const MENU_TILES = 5;

type Tile = SectorHeatmapWidgetData["tiles"][number];

/** Keep the largest tiles and fold the rest into one cap-weighted Other tile. */
export function foldTiles(tiles: Tile[], keep: number): Tile[] {
  if (tiles.length <= keep) return tiles;
  const head = tiles.slice(0, keep - 1);
  const tail = tiles.slice(keep - 1);
  const marketCap = tail.reduce((sum, tile) => sum + tile.marketCap, 0);
  const change =
    marketCap > 0
      ? tail.reduce((sum, tile) => sum + tile.change * tile.marketCap, 0) / marketCap
      : 0;
  const listings = tail.reduce((sum, tile) => sum + tile.listings, 0);
  return [...head, { type: OTHER_SECTOR, label: OTHER_SECTOR, marketCap, change, listings }];
}

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
  const boxWidth = compact ? BOX_WIDTH.menu : BOX_WIDTH.tray;
  const tiles = compact ? foldTiles(data.tiles, MENU_TILES) : data.tiles;
  const rects = treemapLayout(
    tiles.map((tile) => tile.marketCap),
    // Width over height of the box, so splits follow its longer side.
    boxWidth / height
  );
  const href = `/stockmarket/${data.exchange}`;
  return (
    <div className="space-y-1.5">
      <ul className="relative w-full" style={{ height }}>
        {tiles.map((tile, i) => {
          const rect = rects[i]!;
          const label = tile.type === OTHER_SECTOR ? t("other") : tile.label;
          const summary = t("tile", {
            sector: label,
            change: signed(tile.change),
            cap: formatAmount(tile.marketCap),
            count: tile.listings,
          });
          // Text only where it fits whole; every tile keeps its tooltip and label.
          const px = { w: rect.w * boxWidth, h: rect.h * height };
          const showName = px.w >= 64 && px.h >= 34;
          const showChange = px.w >= 38 && px.h >= 18;
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
                {showName && <span className="truncate font-medium">{label}</span>}
                {showChange && (
                  <span className={`tabular-nums ${showName ? "" : "m-auto"}`}>
                    {signed(tile.change)}
                  </span>
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
