"use client";

import { useState } from "react";
import { Tooltip } from "@/components/Tooltip";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { formatMarketingStrength } from "@/lib/utils/formatters";
import type { AttackInfo, SplitStrengthInfo } from "../types";

type SplitStrength = "full" | "half";

const STRENGTH_LABELS: Record<SplitStrength, string> = {
  full: "Full",
  half: "Half",
};

interface AttackPanelProps {
  attackInfo: AttackInfo;
  /**
   * Market splitting is retired under the plants tier: capacity is the
   * authoritative production base there, so buying a slice of an abstract
   * "unowned market" is a second, contradictory way to grow that leaves two
   * economic vocabularies on one page.
   */
  showSplit: boolean;
  splitting: boolean;
  splitError: string;
  splitMsg: string;
  onSplit: (strength: SplitStrength) => void;
  sectorCurrencyCode: CurrencyCode;
  targetCurrencyCode?: CurrencyCode | null;
}

export default function AttackPanel({
  attackInfo,
  showSplit,
  splitting,
  splitError,
  splitMsg,
  onSplit,
  sectorCurrencyCode,
  targetCurrencyCode,
}: AttackPanelProps) {
  const { formatAmount } = useCurrency();
  const affordableStrengths = (["full", "half"] as SplitStrength[]).filter((strength) => {
    const quote = attackInfo.splitStrengths?.[strength];
    const cost = quote?.splitCost ?? (strength === "full" ? attackInfo.splitCost : 0);
    const msCost = quote?.splitMsCost ?? attackInfo.splitMsCost;
    return (
      cost > 0 && attackInfo.userLiquidCapital >= cost && attackInfo.userMarketingStrength >= msCost
    );
  });
  const [selectedStrength, setSelectedStrength] = useState<SplitStrength>(
    affordableStrengths[0] ?? "full"
  );
  const activeStrength = affordableStrengths.includes(selectedStrength)
    ? selectedStrength
    : (affordableStrengths[0] ?? "full");

  const targetNativeCurrency = targetCurrencyCode ?? sectorCurrencyCode;
  const userNativeCurrency =
    (attackInfo.userLiquidCurrencyCode as CurrencyCode | undefined) ?? targetNativeCurrency;
  const formatSectorMoney = (amount: number) => formatAmount(amount, sectorCurrencyCode);
  const formatUserMoney = (amount: number) => formatAmount(amount, userNativeCurrency);
  const splitCurrencyTooltip = `Projected split values are forex-normalized. Local mode shows ${sectorCurrencyCode}, this sector's home currency; other display modes convert from the same underlying value.`;
  const capitalCurrencyTooltip = `Your corporation treasury is denominated in ${userNativeCurrency}; display modes convert it from that native balance.`;

  // Resolve active strength info — fall back to full strength if splitStrengths not yet present
  const activeStrengthInfo: SplitStrengthInfo | null =
    attackInfo.splitStrengths?.[activeStrength] ??
    (activeStrength === "full"
      ? {
          splitCost: attackInfo.splitCost,
          splitMsCost: attackInfo.splitMsCost,
          splitEstimatedCapture: attackInfo.splitEstimatedCapture,
          splitEstimatedNetIncome: 0,
          projectedMarketShare: 0,
          exceedsDominanceThreshold: false,
        }
      : null);

  const activeSplitCost = activeStrengthInfo?.splitCost ?? attackInfo.splitCost;
  const activeSplitMsCost = activeStrengthInfo?.splitMsCost ?? attackInfo.splitMsCost;
  const activeCapture =
    activeStrengthInfo?.splitEstimatedCapture ?? attackInfo.splitEstimatedCapture;
  const activeNetIncome = activeStrengthInfo?.splitEstimatedNetIncome ?? null;
  const activeProjectedShare = activeStrengthInfo?.projectedMarketShare ?? 0;
  const activeDominanceWarning = activeStrengthInfo?.exceedsDominanceThreshold ?? false;

  const hasStrengthData = !!attackInfo.splitStrengths;

  const canSplit =
    activeSplitCost > 0 &&
    attackInfo.userLiquidCapital >= activeSplitCost &&
    attackInfo.userMarketingStrength >= activeSplitMsCost;

  if (!showSplit || attackInfo.canSplit === false || !canSplit) return null;

  const splitReason = "Split the unowned market from this sector page";

  const netIncomeTooltip =
    "Estimated daily net income from the captured revenue, using this sector's current effective margin as a proxy. Actual income depends on your own sector's margin modifiers (tariffs, state metrics, dominance, etc.).";

  // Build dynamic tooltips that show values in the user's display currency
  const buildSplitCostTooltip = () => {
    const baseCost = attackInfo.splitCost;
    const baseMs = attackInfo.splitMsCost;
    const halfMs = Math.max(1, Math.floor(baseMs * 0.5));
    const fullMs = baseMs;
    return `Split cost with strength multiplier:\nFull strength: ${formatSectorMoney(Math.round(baseCost))} + ${fullMs} MS\nHalf strength: ${formatSectorMoney(Math.round(baseCost * 0.5))} + ${halfMs} MS\n\n${splitCurrencyTooltip}`;
  };

  return (
    <div className="rounded-xl border border-card-border bg-card p-6">
      <h2 className="mb-1 text-lg font-bold text-foreground">Market actions</h2>
      <p className="mb-4 text-xs text-muted">Split the unowned share of this sector.</p>

      <div className="grid gap-4">
        <div className="rounded-xl border border-primary/20 bg-background/40 p-4">
          <h3 className="text-sm font-semibold text-foreground">Split unowned market</h3>
          <p className="mt-1 text-xs text-muted">
            Capture the remaining unowned market share for this sector type without targeting a
            competitor directly.
          </p>

          {/* Strength selector */}
          {hasStrengthData && activeSplitCost > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-body-sm font-medium text-muted">Split strength</div>
              <div className="flex gap-1">
                {affordableStrengths.map((strength) => (
                  <button
                    key={strength}
                    onClick={() => setSelectedStrength(strength)}
                    className={`flex-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                      activeStrength === strength
                        ? "border-primary/60 bg-primary/15 text-primary"
                        : "border-card-border/60 bg-background text-muted hover:text-foreground"
                    }`}
                  >
                    {STRENGTH_LABELS[strength]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {splitError && (
            <div className="mt-3 rounded-lg border border-error/30 bg-error/10 p-3 text-xs text-error">
              {splitError}
            </div>
          )}
          {splitMsg && (
            <div className="mt-3 rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success">
              {splitMsg}
            </div>
          )}
          {activeDominanceWarning && canSplit && (
            <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              This capture would push your market share above 50%, triggering a dominance margin
              penalty (up to −15pp). Net income may be lower than estimated.
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 text-xs text-muted">
              <div>
                Cost:{" "}
                <Tooltip content={buildSplitCostTooltip()}>
                  <span className="cursor-help border-b border-dashed border-card-border/70 font-medium text-foreground">
                    {formatSectorMoney(activeSplitCost)}
                  </span>
                </Tooltip>
                {" + "}
                <span className="font-medium text-foreground">{activeSplitMsCost} MS</span>
              </div>
              <div>
                Your capital:{" "}
                <Tooltip content={capitalCurrencyTooltip}>
                  <span className="cursor-help border-b border-dashed border-card-border/70 font-medium text-foreground">
                    {formatUserMoney(attackInfo.userLiquidCapital)}
                  </span>
                </Tooltip>
                {" / "}Your MS:{" "}
                <span className="font-medium text-foreground">
                  {formatMarketingStrength(attackInfo.userMarketingStrength)}
                </span>
              </div>
              <div>
                <Tooltip content={splitCurrencyTooltip}>
                  <span className="cursor-help border-b border-dashed border-card-border/70">
                    Est. revenue
                  </span>
                </Tooltip>
                :{" "}
                <span className="font-medium text-foreground">
                  {formatSectorMoney(activeCapture)}
                </span>
              </div>
              {activeNetIncome !== null && hasStrengthData && (
                <div>
                  <Tooltip content={netIncomeTooltip}>
                    <span className="cursor-help border-b border-dashed border-card-border/70">
                      Est. net income
                    </span>
                  </Tooltip>
                  :{" "}
                  <span
                    className={`font-medium ${activeNetIncome >= 0 ? "text-success" : "text-error"}`}
                  >
                    {formatSectorMoney(activeNetIncome)}
                  </span>
                  {attackInfo.sectorEffectiveMargin !== undefined && (
                    <span className="ml-1 text-muted">
                      ({Math.round(attackInfo.sectorEffectiveMargin)}% margin)
                    </span>
                  )}
                </div>
              )}
              {hasStrengthData && activeProjectedShare > 0 && (
                <div className="text-muted">
                  Projected share:{" "}
                  <span
                    className={`font-medium ${activeDominanceWarning ? "text-warning" : "text-foreground"}`}
                  >
                    {activeProjectedShare.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() => onSplit(activeStrength)}
              disabled={splitting}
              className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
              title={splitReason}
            >
              {splitting
                ? "Splitting..."
                : `Split${activeStrength !== "full" ? ` ${STRENGTH_LABELS[activeStrength]}` : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
