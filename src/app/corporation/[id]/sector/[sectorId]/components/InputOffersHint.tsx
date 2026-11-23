"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchJson } from "@/lib/observability/fetchJson";
import type { SupplyListingView } from "@/lib/db/types/supplyListing";
import type { CommodityFlow } from "../types";

/**
 * Points a sector at the supply offers for one input: the costliest by default,
 * or a short one on its own row (`variant="short"`). Renders nothing while
 * loading, when supply agreements are off, or when nobody is selling, so it
 * never adds a dead end to the panel.
 */
export default function InputOffersHint({
  flow,
  variant = "costliest",
  stateId,
  stateName,
}: {
  flow: CommodityFlow;
  variant?: "costliest" | "short";
  /** The sector's region, so a short input can say when nobody offers it there. */
  stateId?: string;
  stateName?: string;
}) {
  const [sellers, setSellers] = useState(0);
  const [inRegion, setInRegion] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetchJson<{ enabled?: boolean; offers?: SupplyListingView[] }>(
      `/api/supply-offers?commodity=${encodeURIComponent(flow.commodity)}`,
      { signal: controller.signal, feature: "supply-offers-hint" }
    )
      .then((data) => {
        if (controller.signal.aborted || !data.enabled) return;
        const sells = (data.offers ?? []).filter((o) => o.side === "sell" && !o.own);
        setSellers(sells.length);
        setInRegion(sells.filter((o) => !o.stateId || !stateId || o.stateId === stateId).length);
        setLoaded(true);
      })
      .catch(() => {
        // A discovery hint must never break the panel; a failed load just hides it.
        if (!controller.signal.aborted) setSellers(0);
      });
    return () => controller.abort();
  }, [flow.commodity, stateId]);

  if (variant === "short" && loaded && stateName && inRegion === 0) {
    return (
      <span data-no-input-offers={flow.commodity} className="text-body-xs text-muted">
        No offers for {flow.label} in {stateName}
        {sellers > 0 && (
          <>
            {", "}
            <Link
              href={`/commodity/${flow.commodity}/offers`}
              className="text-foreground underline decoration-card-border underline-offset-2 hover:decoration-foreground"
            >
              {sellers} elsewhere on the market
            </Link>
          </>
        )}
      </span>
    );
  }
  if (sellers === 0) return null;
  const link = (
    <Link
      href={`/commodity/${flow.commodity}/offers`}
      className="text-foreground underline decoration-card-border underline-offset-2 hover:decoration-foreground"
    >
      {sellers} {sellers === 1 ? "seller" : "sellers"} offering
    </Link>
  );
  if (variant === "short")
    return (
      <span data-short-input-offers={flow.commodity} className="text-body-xs text-muted">
        {link}
      </span>
    );
  return (
    <p className="mt-2 text-body-xs text-muted">
      {flow.label} is your costliest input. {link}
    </p>
  );
}
