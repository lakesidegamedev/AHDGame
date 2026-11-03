"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_OFFER_VIEW,
  parseOfferView,
  type OfferView,
} from "@/lib/corporations/supplyExchange/offerOrdering";

/** One saved choice shared by the market hub's offers tab and every commodity's offers page. */
export const OFFER_VIEW_STORAGE_KEY = "ahd-supply-offer-view-v1";

function readStored(): unknown {
  try {
    return window.localStorage.getItem(OFFER_VIEW_STORAGE_KEY);
  } catch {
    // storage unavailable: start from the default
    return null;
  }
}

/**
 * The offers list's filters and sort, remembered in this browser. `ready` is
 * false until the saved choice has been read after mount, so a list can wait
 * one tick instead of loading the default first and then reloading.
 *
 * On a single commodity's page the commodity filter does not apply and is left
 * as saved for the hub.
 */
export function useOfferView(singleCommodity: boolean) {
  const [view, setViewState] = useState<OfferView>(DEFAULT_OFFER_VIEW);
  const [ready, setReady] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- reading a browser preference after mount */
  useEffect(() => {
    setViewState(parseOfferView(readStored(), singleCommodity));
    setReady(true);
  }, [singleCommodity]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setView = useCallback(
    (next: OfferView) => {
      setViewState(next);
      try {
        const saved = parseOfferView(readStored());
        window.localStorage.setItem(
          OFFER_VIEW_STORAGE_KEY,
          JSON.stringify(singleCommodity ? { ...next, commodity: saved.commodity } : next)
        );
      } catch {
        // storage unavailable: the choice lasts for this visit
      }
    },
    [singleCommodity]
  );

  return { view, setView, ready };
}
