/**
 * One definition of how supply offers are filtered and ordered, shared by the
 * server read (GET /api/supply-offers) and both offer lists in the browser (the
 * market hub's supply deals tab and a commodity's own offers page). Client
 * safe: no database code, only the client-safe commodity catalogue.
 */

import {
  COMMODITY_LABELS,
  COMMODITY_TYPES,
  type CommodityType,
} from "@/lib/constants/commoditiesCore";

export type OfferKind = "player" | "npp" | "all";
export type OfferSide = "both" | "sell" | "buy";
export type OfferSort = "newest" | "volume" | "premium" | "commodity";
export type OfferSortDir = "asc" | "desc";

const OFFER_KINDS = ["player", "npp", "all"] as const satisfies readonly OfferKind[];
const OFFER_SIDES = ["both", "sell", "buy"] as const satisfies readonly OfferSide[];
export const OFFER_SORTS = [
  "newest",
  "volume",
  "premium",
  "commodity",
] as const satisfies readonly OfferSort[];
export const OFFER_SORT_DIRS = ["asc", "desc"] as const satisfies readonly OfferSortDir[];

/** The direction each sort starts in when picked: biggest, cheapest, newest, A to Z. */
export const OFFER_SORT_DEFAULT_DIR: Record<OfferSort, OfferSortDir> = {
  newest: "desc",
  volume: "desc",
  premium: "asc",
  commodity: "asc",
};

/** Field the server ranks commodities by name in; added by the read pipeline. */
export const COMMODITY_NAME_RANK_FIELD = "commodityNameRank";

const SORT_FIELD: Record<OfferSort, string> = {
  newest: "updatedAt",
  volume: "volumeCap",
  premium: "pricePremium",
  commodity: COMMODITY_NAME_RANK_FIELD,
};

/** Commodity ids in the order of their display names, for the name sort. */
export const COMMODITIES_BY_NAME: readonly CommodityType[] = [...COMMODITY_TYPES].sort((a, b) =>
  COMMODITY_LABELS[a].localeCompare(COMMODITY_LABELS[b], "en")
);

/**
 * Mongo sort for a list of offers. Player offers come before NPP offers when
 * both are listed (an absent `aiListed` sorts before `true`), then the chosen
 * key in the chosen direction, then the listing id so equal rows never swap
 * places between page loads.
 */
export function offerSortSpec(
  sort: OfferSort,
  kind: OfferKind,
  dir: OfferSortDir = OFFER_SORT_DEFAULT_DIR[sort]
): Record<string, 1 | -1> {
  return {
    ...(kind === "all" ? { aiListed: 1 as const } : {}),
    [SORT_FIELD[sort]]: dir === "asc" ? 1 : -1,
    _id: 1,
  };
}

/** What a player has chosen to see in an offers list. */
export interface OfferView {
  kind: OfferKind;
  side: OfferSide;
  /** Empty means every commodity. Ignored on a single commodity's page. */
  commodity: CommodityType | "";
  sort: OfferSort;
  dir: OfferSortDir;
}

export const DEFAULT_OFFER_VIEW: OfferView = {
  kind: "player",
  side: "both",
  commodity: "",
  sort: "newest",
  dir: "desc",
};

function pick<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Sorts that make sense for a view: name order is pointless on one commodity. */
export function offerSortsFor(singleCommodity: boolean): readonly OfferSort[] {
  return singleCommodity ? OFFER_SORTS.filter((s) => s !== "commodity") : OFFER_SORTS;
}

/**
 * A saved view read back from storage, defensively: anything unknown or out of
 * place for this list falls back to the default. A sort the list does not
 * offer resets to newest first.
 */
export function parseOfferView(raw: unknown, singleCommodity = false): OfferView {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      value = null;
    }
  }
  const obj =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const sort = pick(offerSortsFor(singleCommodity), obj.sort, DEFAULT_OFFER_VIEW.sort);
  // A direction only carries over with the sort it was saved with.
  const dir =
    sort === obj.sort
      ? pick(OFFER_SORT_DIRS, obj.dir, OFFER_SORT_DEFAULT_DIR[sort])
      : OFFER_SORT_DEFAULT_DIR[sort];
  return {
    kind: pick(OFFER_KINDS, obj.kind, DEFAULT_OFFER_VIEW.kind),
    side: pick(OFFER_SIDES, obj.side, DEFAULT_OFFER_VIEW.side),
    commodity: singleCommodity ? "" : pick(COMMODITY_TYPES, obj.commodity, ""),
    sort,
    dir,
  };
}

/** True when the view hides some offers (anything but every source, side and commodity). */
export function offerViewNarrows(view: OfferView, singleCommodity = false): boolean {
  return view.kind !== "all" || view.side !== "both" || (!singleCommodity && view.commodity !== "");
}

/** "12 of 40 offers" when the filters hide some, otherwise "40 open offers". */
export function offerCountLabel(shown: number, all: number): string {
  if (shown < all)
    return `${shown.toLocaleString("en-US")} of ${all.toLocaleString("en-US")} offers`;
  return `${all.toLocaleString("en-US")} open ${all === 1 ? "offer" : "offers"}`;
}

export const OFFER_SORT_LABELS: Record<OfferSort, string> = {
  newest: "Date posted",
  volume: "Amount",
  premium: "Price",
  commodity: "Commodity name",
};

/** Plain words for the two directions of a sort. */
export function offerSortDirLabels(sort: OfferSort): Record<OfferSortDir, string> {
  switch (sort) {
    case "newest":
      return { desc: "Newest first", asc: "Oldest first" };
    case "volume":
      return { desc: "Largest first", asc: "Smallest first" };
    case "premium":
      return { asc: "Lowest first", desc: "Highest first" };
    case "commodity":
      return { asc: "A to Z", desc: "Z to A" };
  }
}
