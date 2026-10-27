"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/observability/fetchJson";
import type { NationalizationStatus } from "@/components/corporation/NationalizationStatusCard";
import type { OpenVote } from "@/components/corporation/overview/VoteDocket";

/**
 * Data the corporation page body needs from its own endpoints.
 *
 * Both requests used to be issued by the components that render the answer,
 * which only mount once the corporation payload has arrived: the status strip
 * and the vote docket therefore landed a full round trip after the page did. The
 * page knows the corporation id from the route, so it asks at mount, in parallel
 * with the payload, and hands the answers down.
 */
export function useCorporationPageData(
  corpId: string,
  /** Only the Overview tab draws the docket; every tab draws the status strip. */
  wantsOpenVotes: boolean
): {
  /** Null until the answer lands; the page always owns this request. */
  nationalizationStatus: NationalizationStatus | null;
  /** Empty until the answer lands. */
  openVotes: OpenVote[];
} {
  const [nationalizationStatus, setNationalizationStatus] = useState<NationalizationStatus | null>(
    null
  );
  const [openVotes, setOpenVotes] = useState<OpenVote[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchJson<NationalizationStatus>(`/api/corporations/${corpId}/nationalization-status`, {
      feature: "nationalization-status",
    })
      .then((status) => {
        if (!cancelled) setNationalizationStatus(status);
      })
      // fetchJson has already reported the failure; the strip just stays hidden.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [corpId]);

  useEffect(() => {
    if (!wantsOpenVotes) return;
    let cancelled = false;
    fetchJson<unknown>(`/api/corporations/${corpId}/votes?status=open`, {
      feature: "corp-open-votes",
    })
      .then((data) => {
        if (!cancelled) setOpenVotes(Array.isArray(data) ? (data as OpenVote[]) : []);
      })
      // fetchJson has already reported the failure; the docket just stays empty.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [corpId, wantsOpenVotes]);

  return { nationalizationStatus, openVotes };
}
