import type { Db } from "mongodb";
import type { StockExchangeSnapshot } from "@/lib/db/types/stockExchangeSnapshot";
import { EXCHANGE_API_KEYS } from "@/lib/constants/exchangeRegistry";

export interface SectorTile {
  type: string;
  label: string;
  /** Listed market cap in anchor units, summed over the sector. */
  marketCap: number;
  /** Market-cap-weighted share price change since the previous turn, in percent. */
  change: number;
  listings: number;
}

export interface SectorHeatmapWidgetData {
  exchange: string;
  exchangeName: string;
  turn: number;
  tiles: SectorTile[];
}

/** Biggest sectors get their own tile; the rest fold into one. */
export const HEATMAP_TILES = 9;
export const OTHER_SECTOR = "other";

interface ListingSlice {
  type?: string;
  typeLabel?: string;
  marketCap?: number;
  marketCapAnchor?: number;
  priceChange1h?: number;
}

/** Sum listings into sector tiles, largest first, with a trailing "other" tile. */
export function buildSectorTiles(listings: ListingSlice[]): SectorTile[] {
  const sectors = new Map<string, { label: string; cap: number; weighted: number; n: number }>();
  for (const row of listings) {
    const cap = row.marketCapAnchor ?? row.marketCap ?? 0;
    if (!row.type || !Number.isFinite(cap) || cap <= 0) continue;
    const change = Number.isFinite(row.priceChange1h) ? (row.priceChange1h ?? 0) : 0;
    const entry = sectors.get(row.type) ?? {
      label: row.typeLabel ?? row.type,
      cap: 0,
      weighted: 0,
      n: 0,
    };
    entry.cap += cap;
    entry.weighted += cap * change;
    entry.n += 1;
    sectors.set(row.type, entry);
  }
  const tiles = [...sectors.entries()]
    .map(([type, s]) => ({
      type,
      label: s.label,
      marketCap: s.cap,
      change: s.weighted / s.cap,
      listings: s.n,
    }))
    .sort((a, b) => b.marketCap - a.marketCap);
  if (tiles.length <= HEATMAP_TILES) return tiles;
  const rest = tiles.slice(HEATMAP_TILES - 1);
  const restCap = rest.reduce((sum, tile) => sum + tile.marketCap, 0);
  return [
    ...tiles.slice(0, HEATMAP_TILES - 1),
    {
      type: OTHER_SECTOR,
      label: OTHER_SECTOR,
      marketCap: restCap,
      change: rest.reduce((sum, tile) => sum + tile.marketCap * tile.change, 0) / restCap,
      listings: rest.reduce((sum, tile) => sum + tile.listings, 0),
    },
  ];
}

/**
 * Sector tiles for one exchange from its per-turn snapshot. `priceChange1h`
 * is the snapshot's split-adjusted change against the previous turn, so no
 * history read is needed.
 */
export async function loadSectorHeatmap(
  db: Db,
  exchange: string
): Promise<SectorHeatmapWidgetData | null> {
  if (!EXCHANGE_API_KEYS.has(exchange)) return null;
  const snapshot = await db.collection<StockExchangeSnapshot>("stockExchangeSnapshots").findOne(
    { _id: exchange },
    {
      projection: {
        exchangeName: 1,
        turn: 1,
        "listings.type": 1,
        "listings.typeLabel": 1,
        "listings.marketCap": 1,
        "listings.marketCapAnchor": 1,
        "listings.priceChange1h": 1,
      },
    }
  );
  if (!snapshot) return null;
  return {
    exchange,
    exchangeName: snapshot.exchangeName,
    turn: snapshot.turn,
    tiles: buildSectorTiles(snapshot.listings ?? []),
  };
}
