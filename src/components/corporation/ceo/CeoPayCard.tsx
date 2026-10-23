"use client";

import { useEffect, useState } from "react";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { DenseSection, InlineStatus, KVRow, SmallButton } from "../dense/DenseKit";

interface PayDemand {
  amount: number;
  turn: number;
  expiresTurn: number;
  level: number;
  trailingProfit: number;
}

interface PayDecision {
  turn: number;
  outcome: "accepted" | "countered" | "replaced";
  salary?: number;
  bySystem: boolean;
}

interface PayView {
  /** Company currency; every amount here is in it, per day. */
  currencyCode: CurrencyCode;
  salary: number;
  nextReviewTurn: number;
  level: number | null;
  demand: PayDemand | null;
  lastDecision: PayDecision | null;
}

type PayAnswer =
  { action: "accept" } | { action: "counter"; amount: number } | { action: "replace" };

/** One line about the last pay decision, in plain words. */
function decisionLine(decision: PayDecision, money: (amount: number) => string): string {
  if (decision.outcome === "replaced") {
    return decision.bySystem
      ? `Turn ${decision.turn}: your standing policy replaced the CEO`
      : `Turn ${decision.turn}: you replaced the CEO`;
  }
  if (decision.outcome === "countered") {
    return decision.salary != null
      ? `Turn ${decision.turn}: you countered to ${money(decision.salary)} per day`
      : `Turn ${decision.turn}: you countered the raise`;
  }
  return decision.bySystem
    ? `Turn ${decision.turn}: raise accepted by your standing policy`
    : `Turn ${decision.turn}: you accepted the raise`;
}

/**
 * The NPP CEO's salary and the raise it is asking for. The owner can accept the
 * demand, counter it, or replace the CEO. An unanswered demand falls back to
 * the corporation's standing pay policy when its window closes.
 */
export function CeoPayCard({ corpId }: { corpId: string }) {
  const { formatFull, toInternalFrom } = useCurrency();
  const [view, setView] = useState<PayView | null>(null);
  const [counter, setCounter] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/corporations/${corpId}/ceo-pay`)
      .then((res) => (res.ok ? (res.json() as Promise<{ ceoPay: PayView | null }>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        setView(data.ceoPay);
        setCounter(data.ceoPay?.demand?.amount ?? 0);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the CEO's pay.");
      });
    return () => {
      cancelled = true;
    };
  }, [corpId]);

  async function refresh() {
    const res = await fetch(`/api/corporations/${corpId}/ceo-pay`);
    if (!res.ok) return;
    const data = (await res.json()) as { ceoPay: PayView | null };
    setView(data.ceoPay);
    setCounter(data.ceoPay?.demand?.amount ?? 0);
  }

  async function answer(body: PayAnswer) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/corporations/${corpId}/ceo-pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not answer the pay demand.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  if (!view) return error ? <InlineStatus message={error} tone="error" /> : null;

  const { salary, nextReviewTurn, demand, lastDecision, currencyCode } = view;
  const formatAmount = (local: number) =>
    formatFull(toInternalFrom(local, currencyCode), currencyCode);

  return (
    <DenseSection id="ceo-pay" title="CEO pay" meta={demand ? "Raise requested" : undefined}>
      <div className="space-y-2 py-1">
        <p className="text-xs text-muted">
          Better CEOs cut your management overhead. A new CEO starts at a low level.
        </p>
        <div className="divide-y divide-card-border border-y border-card-border">
          {view.level != null && <KVRow label="CEO level" value={view.level} />}
          <KVRow label="CEO salary" value={`${formatAmount(salary)} per day`} />
          <KVRow label="Next pay review" mono={false} value={`Turn ${nextReviewTurn}`} />
        </div>
        {demand && (
          <div className="space-y-2 border-y border-card-border py-2">
            <p className="text-sm font-medium">
              Your CEO (level {demand.level}) asks for {formatAmount(demand.amount)} per day.
            </p>
            <p className="text-xs text-muted">
              Unanswered by turn {demand.expiresTurn}, your standing policy decides.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <SmallButton
                tone="primary"
                disabled={busy}
                onClick={() => void answer({ action: "accept" })}
              >
                Accept
              </SmallButton>
              <input
                type="number"
                min={0}
                step={1}
                value={counter}
                onChange={(e) => setCounter(Math.max(0, Number(e.target.value) || 0))}
                aria-label="Counter offer per day"
                className="h-7 w-28 rounded-md border border-card-border bg-background px-2 text-right text-[13px] tabular-nums text-foreground focus:border-foreground focus:outline-none"
              />
              <SmallButton
                disabled={busy}
                onClick={() => void answer({ action: "counter", amount: counter })}
              >
                Counter
              </SmallButton>
              <SmallButton
                tone="danger"
                disabled={busy}
                onClick={() => void answer({ action: "replace" })}
              >
                Replace CEO
              </SmallButton>
            </div>
          </div>
        )}
        {!demand && lastDecision && (
          <p className="text-xs text-muted">{decisionLine(lastDecision, formatAmount)}</p>
        )}
        <InlineStatus message={error} tone="error" />
      </div>
    </DenseSection>
  );
}
