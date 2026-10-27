"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchJson } from "@/lib/observability/fetchJson";
import { NoticeStrip } from "./ledger/NoticeStrip";

export interface NationalizationStatus {
  hasStatus: boolean;
  canBid?: boolean;
  hasExposure?: boolean;
  pendingTaking: {
    turnsLeft: number;
    deadlineTurn: number;
    tier: string;
    method: string;
    triggers: string[];
    curableTriggers: string[];
    isSector: boolean;
  } | null;
  billsInVoting: {
    billId: string;
    title: string;
    whole: boolean;
    sectorCount: number;
  }[];
  isSpunOut: boolean;
  privatizedAtTurn: number | null;
  goldenSharePercent: number;
  auctionOpen: boolean;
  auction: {
    auctionId: string;
    countryId: string;
    reservePrice: number;
    currency: string;
    highestBid: number;
    bidCount: number;
    turnsLeft: number;
  } | null;
}

/**
 * Nationalization context for owners and holders, with a bid link only when
 * the status response confirms that the viewer can place a funded bid.
 *
 * `status` is passed by the corporation page, which starts the request with its
 * first paint so the card does not wait for the page's own payload to arrive
 * before it can ask. Omitted (and `null` counts: it means "no status yet"), the
 * card fetches for itself.
 */
export function NationalizationStatusCard({
  corpId,
  hasExposure = false,
  status: seededStatus,
}: {
  corpId: string;
  hasExposure?: boolean;
  status?: NationalizationStatus | null;
}) {
  const [loaded, setLoaded] = useState<{
    corpId: string;
    status: NationalizationStatus;
  } | null>(null);
  const status =
    seededStatus !== undefined ? seededStatus : loaded?.corpId === corpId ? loaded.status : null;

  useEffect(() => {
    if (seededStatus !== undefined) return;
    let cancelled = false;
    fetchJson<NationalizationStatus>(`/api/corporations/${corpId}/nationalization-status`, {
      feature: "nationalization-status",
    })
      .then((s) => {
        if (!cancelled) setLoaded({ corpId, status: s });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [corpId, seededStatus]);

  if (!status?.hasStatus) return null;
  const t = status.pendingTaking;

  if (!hasExposure && !status.hasExposure && !status.canBid) return null;
  const message = t
    ? `Nationalization is pending and is due on turn ${t.deadlineTurn}.`
    : status.billsInVoting.length > 0
      ? "A nationalization bill affecting this corporation is being voted on."
      : status.auction
        ? "This corporation is being sold at a privatization auction."
        : status.goldenSharePercent > 0
          ? `The state holds a ${Math.round(status.goldenSharePercent * 100)}% golden share in this corporation.`
          : "This corporation has left state ownership.";

  return (
    <NoticeStrip tone={t ? "error" : "info"} tag="State ownership">
      <p className="m-0">
        {message}
        {status.canBid && status.auction && (
          <>
            {" "}
            <Link
              href={`/country/${status.auction.countryId.toLowerCase()}/nationalization#auction-${status.auction.auctionId}`}
              className="underline"
            >
              Place a bid
            </Link>
            .
          </>
        )}
      </p>
    </NoticeStrip>
  );
}
