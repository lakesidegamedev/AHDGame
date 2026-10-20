"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/observability/fetchJson";
import { DenseSection, InlineStatus, SmallButton } from "./dense/DenseKit";

interface AntitrustCaseView {
  countryId: string;
  sectorType: string;
  sharePercent: number;
  thresholdPercent: number;
  openedTurn: number;
  decideByTurn: number;
  decision?: "order" | "dismiss";
  authoritySeatName: string | null;
  authorityHolderName: string | null;
  viewerIsAuthority: boolean;
}

/**
 * The open Competition Act case against this corporation's group, if any.
 * The country's competition authority can order a breakup or dismiss it;
 * undecided, the case follows the share measured at its deadline.
 */
export function AntitrustCaseCard({ corpId }: { corpId: string }) {
  const [view, setView] = useState<AntitrustCaseView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchJson<{ antitrustCase: AntitrustCaseView | null }>(
      `/api/corporations/${corpId}/antitrust-case`,
      { feature: "corp-antitrust-case" }
    )
      .then((data) => {
        if (!cancelled) setView(data.antitrustCase);
      })
      // fetchJson has already reported the failure; the card just stays hidden.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [corpId]);

  async function refresh() {
    const res = await fetch(`/api/corporations/${corpId}/antitrust-case`);
    if (!res.ok) return;
    const data = (await res.json()) as { antitrustCase: AntitrustCaseView | null };
    setView(data.antitrustCase);
  }

  async function decide(decision: "order" | "dismiss") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/corporations/${corpId}/antitrust-case`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not record the decision.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  if (!view) return null;

  const authority = view.authoritySeatName ?? "The competition authority";
  const decided = view.decision != null;

  return (
    <DenseSection title="Competition case">
      <div className="space-y-2 py-1">
        <p className="text-sm">
          This group holds {view.sharePercent}% of the {view.sectorType} industry in{" "}
          {view.countryId}, above the {view.thresholdPercent}% the Competition Act allows.
        </p>
        {decided ? (
          <p className="text-sm font-medium">
            {view.decision === "order" ? "Decided: breakup ordered" : "Decided: dismissed"}, applied
            next turn.
          </p>
        ) : (
          <p className="text-xs text-muted">
            {authority} decides by turn {view.decideByTurn}. Undecided, the case follows the
            measured share then.
          </p>
        )}
        {!decided && view.viewerIsAuthority && (
          <div className="flex flex-wrap items-center gap-2">
            <SmallButton tone="danger" disabled={busy} onClick={() => void decide("order")}>
              Order breakup
            </SmallButton>
            <SmallButton disabled={busy} onClick={() => void decide("dismiss")}>
              Dismiss case
            </SmallButton>
          </div>
        )}
        <InlineStatus message={error} tone="error" />
      </div>
    </DenseSection>
  );
}
