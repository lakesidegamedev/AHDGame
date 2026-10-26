"use client";

import { useState } from "react";
import { useMarketJson } from "./useMarketJson";
import { PanelState } from "./marketUi";
import type { CommodityData } from "@/app/country/[code]/stockmarket/types";
import type { CommodityType } from "@/lib/constants/commoditiesCore";
import {
  DEFAULT_OFFER_VIEW,
  offerCountLabel,
  offerViewNarrows,
} from "@/lib/corporations/supplyExchange/offerOrdering";
import { SupplyOfferHeader, SupplyOfferRow } from "./SupplyOfferRow";
import {
  SUPPLY_PAGE_SIZE,
  SupplyFilterBar,
  offersQuery,
  type SupplyOffersResponse,
} from "./supplyOfferUi";
import { useOfferView } from "./useOfferView";

/**
 * Open supply offers with filter and sort controls. Without `commodity` it is
 * the market hub's list across every commodity; with one it is that
 * commodity's own offers page. Both share the controls, the saved choice and
 * the server-side ordering, so the two lists always behave the same.
 */
export function SupplyDealsPanel({ commodity }: { commodity?: CommodityType } = {}) {
  const single = commodity !== undefined;
  const [page, setPage] = useState(1);
  const { view, setView, ready } = useOfferView(single);
  const filters = single ? { ...view, commodity } : view;
  const { data, error, loading, reload } = useMarketJson<SupplyOffersResponse>(
    ready ? `/api/supply-offers?${offersQuery(filters, page, SUPPLY_PAGE_SIZE)}` : null
  );
  const prices = useMarketJson<{ commodities?: CommodityData[] }>("/api/commodities");
  const priceOf = (id: string) =>
    prices.data?.commodities?.find((c) => c.commodity === id)?.globalPrice;
  const offers = data?.offers ?? [];
  const total = data?.total ?? 0;
  const totalAll = Math.max(total, data?.totalAll ?? total);
  const narrowed = offerViewNarrows(view, single);

  const change = (next: typeof view) => {
    setView(next);
    setPage(1);
  };

  return (
    <PanelState loading={!ready || loading} error={error}>
      {data && !data.enabled ? (
        <p className="py-6 text-sm text-muted">Supply agreements are not enabled in this world.</p>
      ) : (
        <section className="rounded-xl border border-card-border bg-card p-4 shadow-card sm:p-5">
          <SupplyFilterBar filters={view} onChange={change} showCommodity={!single} />
          <p className="mt-2 text-xs text-muted">
            {offerCountLabel(total, totalAll)}.
            {!single && " Taking one starts a binding agreement at the listed terms."}
          </p>
          <div className="mt-3">
            <SupplyOfferHeader />
          </div>
          {offers.length === 0 ? (
            <div className="flex flex-wrap items-center gap-3 py-4 text-sm text-muted">
              <p>
                {totalAll > 0 && narrowed
                  ? "No offers match these filters."
                  : "There are no open offers right now."}
              </p>
              {totalAll > 0 && narrowed && (
                <button
                  type="button"
                  onClick={() =>
                    change({
                      ...view,
                      kind: "all",
                      side: DEFAULT_OFFER_VIEW.side,
                      commodity: single ? view.commodity : "",
                    })
                  }
                  className="h-7 rounded-md border border-card-border px-2.5 text-xs text-foreground hover:bg-card-elevated"
                >
                  Show all offers
                </button>
              )}
            </div>
          ) : (
            <ul>
              {offers.map((offer) => (
                <SupplyOfferRow
                  key={offer.id}
                  offer={offer}
                  commodity={offer.commodity}
                  marketPrice={priceOf(offer.commodity)}
                  corporations={data?.myCorporations ?? []}
                  onTaken={reload}
                />
              ))}
            </ul>
          )}
          {(page > 1 || data?.hasMore) && (
            <div className="mt-3 flex items-center justify-between text-xs text-muted">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="h-7 rounded-md border border-card-border px-2.5 text-foreground disabled:opacity-40"
              >
                Previous
              </button>
              <span>Page {page}</span>
              <button
                type="button"
                disabled={!data?.hasMore}
                onClick={() => setPage((p) => p + 1)}
                className="h-7 rounded-md border border-card-border px-2.5 text-foreground disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </section>
      )}
    </PanelState>
  );
}
