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
import {
  OFFER_SORT_DEFAULT_DIR,
  type OfferView,
} from "@/lib/corporations/supplyExchange/offerOrdering";
import type { SupplyListingView } from "@/lib/db/types/supplyListing";
import type { OfferCorporation } from "./SupplyOfferRow";

export const STOCKS_URL = "/api/stock-exchange?exchange=global";
export const stocksUrl = (exchange: string) =>
  `/api/stock-exchange?exchange=${encodeURIComponent(exchange)}`;
export const BONDS_URL = "/api/bonds";

/** Overview cards show five rows, so they ask for only those. */
export const STOCKS_PREVIEW_URL = `${STOCKS_URL}&preview=5`;
export const BONDS_PREVIEW_URL = `${BONDS_URL}?preview=5`;
export const FUNDS_URL = "/api/investment-funds?exchange=global";

export const sectorsUrl = (page: number) =>
  `/api/sectors?view=forSale&sort=revenue&dir=desc&page=${page}`;

export const SUPPLY_PAGE_SIZE = 20;

/** GET /api/supply-offers, as both the hub preview and the deals panel read it. */
export interface SupplyOffersResponse {
  enabled: boolean;
  offers: SupplyListingView[];
  myCorporations: OfferCorporation[];
  currentTurn: number;
  page: number;
  hasMore: boolean;
  /** Offers matching the filters. */
  total: number;
  /** Every open offer in the commodity scope, before the source and side filters. */
  totalAll?: number;
}

/** Query string for GET /api/supply-offers; omits anything left at its default. */
export function offersQuery(filters: OfferView, page?: number, pageSize?: number): string {
  const params = new URLSearchParams();
  if (page) params.set("page", String(page));
  if (pageSize) params.set("pageSize", String(pageSize));
  params.set("kind", filters.kind);
  if (filters.side !== "both") params.set("side", filters.side);
  if (filters.commodity) params.set("commodity", filters.commodity);
  params.set("sort", filters.sort);
  if (filters.dir !== OFFER_SORT_DEFAULT_DIR[filters.sort]) params.set("dir", filters.dir);
  return params.toString();
}

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
