/**
 * Endpoint paths and response shapes shared by the market hub and its tab
 * panels.
 *
 * The panels are lazily imported (`MarketHub` renders one per tab), so any
 * constant the hub itself needs cannot live beside a panel: a static import of
 * `MarketPanels` or `SupplyDealsPanel` pulled the whole panel, its tables and
 * the commodity catalogue into the hub's first load. Keep this module to URLs,
 * types and plain literals so it stays cheap for both sides.
 */
import type { BondListing } from "@/app/country/[code]/stockmarket/types";
import type { FundListItem } from "@/components/indexFunds/types";
import type { CorporationType } from "@/lib/constants/corporationsClient";

export const STOCKS_URL = "/api/stock-exchange?exchange=global";
export const stocksUrl = (exchange: string) =>
  `/api/stock-exchange?exchange=${encodeURIComponent(exchange)}`;
export const BONDS_URL = "/api/bonds";
export const FUNDS_URL = "/api/investment-funds?exchange=global";

export const sectorsUrl = (page: number) =>
  `/api/sectors?view=forSale&sort=revenue&dir=desc&page=${page}`;

export interface BondsResponse {
  bonds?: BondListing[];
  totalOutstanding?: number;
}

export interface FundsResponse {
  funds?: FundListItem[];
}

/** One sector offered for sale, as the sectors tab renders it. */
export interface SectorForSale {
  id: string;
  sectorType: CorporationType;
  sectorTypeLabel: string;
  stateName: string;
  countryName: string;
  countryFlag: string;
  corporationId: string | null;
  corporationName: string | null;
  corporationSequentialId: number | null;
  revenueAnchor: number;
  margin: number | null;
  growthRate: number | null;
  forSalePrice: number | null;
}

export interface SectorsForSaleResponse {
  page: number;
  totalPages: number;
  totalItems: number;
  sectors: SectorForSale[];
  counts: { unowned: number; owned: number; forSale: number };
}
