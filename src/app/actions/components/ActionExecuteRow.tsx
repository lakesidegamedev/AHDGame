"use client";

import { useWorldFlags } from "@/hooks/useWorldFlags";
import { campaignLocalRate, getCampaignCurrency } from "@/lib/campaigns/rules/currency";
import { formatCurrencyFaceAmount } from "@/lib/currency/formatCurrencyFaceAmount";
import { useId, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useCurrency } from "@/contexts/CurrencyContext";
import {
  BATCHABLE_ACTION_TYPES,
  getBatchAffordability,
  simulateActionBatch,
  type ActionStateEconomics,
} from "@/lib/actions";
import type { ActionType, Character } from "@/lib/db/types";

type BatchCount = 5 | 10;

export interface ActionExecuteRowProps {
  actionType: string;
  actionLabel: string;
  character: Character;
  homeState: ActionStateEconomics | null;
  blocked: boolean;
  executingKey: string | null;
  onExecute: (type: string, count?: 1 | 5 | 10) => void;
  /** Compact layout for grid row (smaller controls). */
  compact?: boolean;
  /** Must match execute route so batch previews use the same fund pool as the server. */
  forexEnabled?: boolean;
}

/**
 * Later runs in a batch can cost more than the first because each run moves the
 * stat the price is tiered on. Says so, with the first-run price, whenever the
 * batch total is above count times that price.
 */
export function batchEscalationNote(
  count: number,
  singleRunNetFunds: number,
  batchNetFunds: number,
  format: (amount: number) => string
): string | null {
  const single = -singleRunNetFunds;
  const total = -batchNetFunds;
  if (single <= 0 || total <= single * count * 1.001) return null;
  return `Price rises as your stats move, so later runs cost more than the first run (${format(single)} each if nothing changed, ${format(single * count)} for ${count}).`;
}

export default function ActionExecuteRow({
  actionType,
  actionLabel,
  character,
  homeState,
  blocked,
  executingKey,
  onExecute,
  compact,
  forexEnabled = false,
}: ActionExecuteRowProps) {
  const { baseRates } = useCurrency();
  const { preset, campaignPriceLevel, nationalGdpPerCapita } = useWorldFlags();
  const nationalBasis = nationalGdpPerCapita?.[character.countryId ?? "US"];
  const campaignRate = forexEnabled
    ? campaignLocalRate(character.countryId ?? "US", baseRates, preset)
    : 1;
  const batchHintId = useId();
  const [confirmCount, setConfirmCount] = useState<BatchCount | null>(null);

  const state = homeState ?? undefined;

  const batchable = useMemo(
    () => BATCHABLE_ACTION_TYPES.includes(actionType as ActionType),
    [actionType]
  );

  const sim5 = useMemo(() => {
    if (blocked || !batchable) return null;
    return simulateActionBatch(
      character,
      state,
      actionType as ActionType,
      5,
      forexEnabled,
      campaignRate,
      { preset, priceLevel: campaignPriceLevel, nationalGdpPerCapita: nationalBasis }
    );
  }, [
    batchable,
    blocked,
    character,
    state,
    actionType,
    forexEnabled,
    campaignRate,
    preset,
    campaignPriceLevel,
    nationalBasis,
  ]);

  const sim10 = useMemo(() => {
    if (blocked || !batchable) return null;
    return simulateActionBatch(
      character,
      state,
      actionType as ActionType,
      10,
      forexEnabled,
      campaignRate,
      { preset, priceLevel: campaignPriceLevel, nationalGdpPerCapita: nationalBasis }
    );
  }, [
    batchable,
    blocked,
    character,
    state,
    actionType,
    forexEnabled,
    campaignRate,
    preset,
    campaignPriceLevel,
    nationalBasis,
  ]);

  const sim1 = useMemo(() => {
    if (blocked || !batchable) return null;
    return simulateActionBatch(
      character,
      state,
      actionType as ActionType,
      1,
      forexEnabled,
      campaignRate,
      { preset, priceLevel: campaignPriceLevel, nationalGdpPerCapita: nationalBasis }
    );
  }, [
    batchable,
    blocked,
    character,
    state,
    actionType,
    forexEnabled,
    campaignRate,
    preset,
    campaignPriceLevel,
    nationalBasis,
  ]);

  const can5 = batchable && sim5?.ok;
  const can10 = batchable && sim10?.ok;

  // Only computed when a batch is refused, to tell the player how far they can go.
  const afford5 = useMemo(
    () =>
      !blocked && batchable && !can5
        ? getBatchAffordability(
            character,
            state,
            actionType as ActionType,
            5,
            forexEnabled,
            campaignRate,
            {
              preset,
              priceLevel: campaignPriceLevel,
              nationalGdpPerCapita: nationalBasis,
            }
          )
        : null,
    [
      batchable,
      blocked,
      can5,
      character,
      state,
      actionType,
      forexEnabled,
      campaignRate,
      preset,
      campaignPriceLevel,
      nationalBasis,
    ]
  );
  const afford10 = useMemo(
    () =>
      !blocked && batchable && !can10
        ? getBatchAffordability(
            character,
            state,
            actionType as ActionType,
            10,
            forexEnabled,
            campaignRate,
            {
              preset,
              priceLevel: campaignPriceLevel,
              nationalGdpPerCapita: nationalBasis,
            }
          )
        : null,
    [
      batchable,
      blocked,
      can10,
      character,
      state,
      actionType,
      forexEnabled,
      campaignRate,
      preset,
      campaignPriceLevel,
      nationalBasis,
    ]
  );

  const execKey = actionType;
  const execKey5 = `${actionType}:5`;
  const execKey10 = `${actionType}:10`;

  const isBusy =
    executingKey === execKey || executingKey === execKey5 || executingKey === execKey10;

  const btnBase = compact
    ? "rounded-md px-2.5 py-1.5 text-body-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    : "rounded-lg px-3 py-2 text-body font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  const primary =
    isBusy && executingKey === execKey
      ? "bg-muted cursor-wait text-white"
      : "bg-primary hover:bg-primary-dark text-primary-foreground";

  const batchIdle =
    "border border-card-border bg-card-elevated text-foreground hover:bg-card-muted";

  const pendingConfirm = confirmCount === 5 ? sim5 : confirmCount === 10 ? sim10 : null;

  // One note sits under both batch buttons. When both are blocked it explains
  // the 5-run case and says so for 10, instead of reading as the 10-run reason.
  const batchHint =
    !can5 && !can10 && afford5?.title
      ? `${afford5.title} 10 runs cost more still.`
      : (afford5?.title ?? afford10?.title);

  const campaignCurrencyCode = getCampaignCurrency(character.countryId ?? "US", preset);
  const escalation =
    confirmCount && pendingConfirm?.ok && sim1?.ok
      ? batchEscalationNote(
          confirmCount,
          sim1.netFundsChange * campaignRate,
          pendingConfirm.netFundsChange * campaignRate,
          (amount) => formatCurrencyFaceAmount(amount, campaignCurrencyCode)
        )
      : null;

  return (
    <>
      <div className={compact ? "w-full" : undefined}>
        <div
          className={`flex flex-wrap items-center gap-1.5 ${compact ? "justify-end w-full" : ""}`}
        >
          <button
            type="button"
            onClick={() => onExecute(actionType, 1)}
            disabled={blocked || isBusy}
            className={`${btnBase} ${primary} ${compact ? "min-w-[72px] flex-1 sm:flex-none" : "flex-1 min-w-0 sm:flex-none"}`}
          >
            {executingKey === execKey ? "Working…" : actionLabel}
          </button>

          {batchable && (
            <>
              <button
                type="button"
                onClick={() => setConfirmCount(5)}
                disabled={blocked || isBusy || !can5}
                aria-label={`${actionLabel} 5 times`}
                aria-describedby={!can5 && batchHint ? batchHintId : undefined}
                className={`${btnBase} ${batchIdle} ${!can5 ? "opacity-40" : ""} ${compact ? "min-w-[36px]" : ""}`}
              >
                5 times
              </button>
              <button
                type="button"
                onClick={() => setConfirmCount(10)}
                disabled={blocked || isBusy || !can10}
                aria-label={`${actionLabel} 10 times`}
                aria-describedby={!can10 && batchHint ? batchHintId : undefined}
                className={`${btnBase} ${batchIdle} ${!can10 ? "opacity-40" : ""} ${compact ? "min-w-[36px]" : ""}`}
              >
                10 times
              </button>
            </>
          )}
        </div>

        {batchHint && (
          <p id={batchHintId} className="mt-1 text-body-sm text-muted">
            {batchHint}
          </p>
        )}
      </div>

      {confirmCount &&
        pendingConfirm?.ok &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
            onClick={() => setConfirmCount(null)}
          >
            <div
              className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-card-border bg-card p-5 shadow-modal"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="batch-confirm-title"
            >
              <h2 id="batch-confirm-title" className="text-heading font-semibold text-foreground">
                {actionLabel} {confirmCount} times?
              </h2>
              <p className="mt-2 text-body-sm text-muted">
                This will spend{" "}
                <span className="font-semibold text-foreground">
                  {pendingConfirm.totalActionPoints} action points
                </span>{" "}
                total and change campaign funds by{" "}
                <span
                  className={`font-semibold ${pendingConfirm.netFundsChange >= 0 ? "text-success" : "text-error"}`}
                >
                  {pendingConfirm.netFundsChange >= 0 ? "+" : ""}
                  {formatCurrencyFaceAmount(
                    pendingConfirm.netFundsChange * campaignRate,
                    getCampaignCurrency(character.countryId ?? "US", preset)
                  )}
                </span>
                .
              </p>
              {escalation && <p className="mt-2 text-body-sm text-muted">{escalation}</p>}
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmCount(null)}
                  className="rounded-lg border border-card-border bg-card-elevated px-4 py-2 text-body font-semibold text-foreground hover:bg-card-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const c = confirmCount;
                    setConfirmCount(null);
                    onExecute(actionType, c);
                  }}
                  disabled={isBusy}
                  className="rounded-lg bg-primary px-4 py-2 text-body font-semibold text-primary-foreground hover:bg-primary-dark transition-colors disabled:bg-card-border disabled:text-muted disabled:hover:bg-card-border"
                >
                  {actionLabel} {confirmCount} times
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
