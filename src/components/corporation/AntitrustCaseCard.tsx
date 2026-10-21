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

interface AntitrustOrdersView {
  forcedSales: Array<{
    corporationId: string;
    corporationName: string;
    reason: "subsidiaryCap" | "foreignBan" | "foreignShareCap";
    countryId: string;
    dueTurn: number;
  }>;
  industryOrder: {
    sectorType: string;
    countryId: string;
    thresholdPercent: number;
    dueTurn: number;
  } | null;
}

interface AntitrustResponse {
  antitrustCase: AntitrustCaseView | null;
  orders?: AntitrustOrdersView;
  currentTurn?: number;
}

const FORCED_SALE_REASON: Record<AntitrustOrdersView["forcedSales"][number]["reason"], string> = {
  subsidiaryCap: "Subsidiary Limits Act: too many subsidiaries in",
  foreignBan: "Foreign Investment Act: foreign-controlled subsidiaries banned in",
  foreignShareCap: "Foreign Investment Act: foreign groups over their industry cap in",
};

function turnsLeft(dueTurn: number, currentTurn: number | undefined): string {
  if (currentTurn == null) return `by turn ${dueTurn}`;
  const left = dueTurn - currentTurn;
  return left > 0 ? `by turn ${dueTurn} (${left} turns left)` : `by turn ${dueTurn} (due now)`;
}

/**
 * The open Competition Act case against this corporation's group, if any.
 * The country's competition authority can order a breakup or dismiss it;
 * undecided, the case follows the share measured at its deadline. Also lists
 * standing orders: subsidiaries the group must give up and an industry-share
 * order, each with its deadline, so the cost is visible before it lands.
 */
export function AntitrustCaseCard({ corpId }: { corpId: string }) {
  const [view, setView] = useState<AntitrustCaseView | null>(null);
  const [orders, setOrders] = useState<AntitrustOrdersView | null>(null);
  const [currentTurn, setCurrentTurn] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchJson<AntitrustResponse>(`/api/corporations/${corpId}/antitrust-case`, {
      feature: "corp-antitrust-case",
    })
      .then((data) => {
        if (cancelled) return;
        setView(data.antitrustCase);
        setOrders(data.orders ?? null);
        setCurrentTurn(data.currentTurn);
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
    const data = (await res.json()) as AntitrustResponse;
    setView(data.antitrustCase);
    setOrders(data.orders ?? null);
    setCurrentTurn(data.currentTurn);
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

  const hasOrders = !!orders && (orders.forcedSales.length > 0 || orders.industryOrder != null);
  if (!view && !hasOrders) return null;

  return (
    <>
      {view && (
        <CaseSection
          view={view}
          busy={busy}
          error={error}
          onDecide={(decision) => void decide(decision)}
        />
      )}
      {orders && hasOrders && (
        <DenseSection title="Antitrust orders">
          <div className="space-y-2 py-1 text-sm">
            {orders.industryOrder && (
              <p>
                Bring this group under {orders.industryOrder.thresholdPercent}% of the{" "}
                {orders.industryOrder.sectorType} industry in {orders.industryOrder.countryId}{" "}
                {turnsLeft(orders.industryOrder.dueTurn, currentTurn)}.
              </p>
            )}
            {orders.forcedSales.map((sale) => (
              <p key={sale.corporationId}>
                <span className="font-medium">{sale.corporationName}</span> must leave the group{" "}
                {turnsLeft(sale.dueTurn, currentTurn)}. {FORCED_SALE_REASON[sale.reason]}{" "}
                {sale.countryId}.
              </p>
            ))}
            {orders.forcedSales.length > 0 && (
              <p className="text-xs text-muted">
                Sell, spin off or release control before the deadline. After it, the controlling
                stake is sold down to half at book value.
              </p>
            )}
          </div>
        </DenseSection>
      )}
    </>
  );
}

function CaseSection({
  view,
  busy,
  error,
  onDecide: decide,
}: {
  view: AntitrustCaseView;
  busy: boolean;
  error: string;
  onDecide: (decision: "order" | "dismiss") => void;
}) {
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
            <SmallButton tone="danger" disabled={busy} onClick={() => decide("order")}>
              Order breakup
            </SmallButton>
            <SmallButton disabled={busy} onClick={() => decide("dismiss")}>
              Dismiss case
            </SmallButton>
          </div>
        )}
        <InlineStatus message={error} tone="error" />
      </div>
    </DenseSection>
  );
}
