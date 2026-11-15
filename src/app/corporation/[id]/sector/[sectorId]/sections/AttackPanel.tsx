"use client";

import { useState } from "react";
import { PlantSplitPlannerModal } from "@/components/corporation/PlantSplitPlannerModal";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { AttackInfo } from "../types";

interface AttackPanelProps {
  attackInfo: AttackInfo;
  targetName: string;
  showAttack: boolean;
  /** Deep link from the corporation page drawer: open the plant-split planner. */
  openPlannerOnMount?: boolean;
  attacking: boolean;
  attackError: string;
  attackMsg: string;
  onAttack: () => Promise<boolean>;
}

export default function AttackPanel({
  attackInfo,
  targetName,
  showAttack,
  openPlannerOnMount = false,
  attacking,
  attackError,
  attackMsg,
  onAttack,
}: AttackPanelProps) {
  const { formatAmount } = useCurrency();
  const [plannerOpen, setPlannerOpen] = useState(openPlannerOnMount);

  const canAttack =
    attackInfo.userLiquidCapital >= (attackInfo.plantSplitQuote?.cashCostAnchor ?? Infinity) &&
    attackInfo.userMarketingStrength >=
      (attackInfo.plantSplitQuote?.marketingStrengthCost ?? Infinity);

  if (!showAttack || !attackInfo.plantSplitQuote || attackInfo.plantCount == null) return null;
  const availableAttack = attackInfo.canAttack !== false && canAttack;
  if (!availableAttack) return null;

  return (
    <div className="rounded-xl border border-card-border bg-card p-6">
      <h2 className="mb-1 text-lg font-bold text-foreground">Market actions</h2>
      <p className="mb-4 text-xs text-muted">
        Attempt a sector split against this rival&apos;s whole plants.
      </p>

      <div className="grid gap-4">
        {attackInfo.plantSplitQuote && attackInfo.plantCount != null && (
          <div className="rounded-xl border border-error/20 bg-background/40 p-4">
            <h3 className="text-sm font-semibold text-foreground">Split rival plants</h3>
            <p className="mt-1 text-xs text-muted">
              Your MS against theirs sets the share, from 1% up to 20% of their plants, and the
              success chance. Plants you win transfer intact.
            </p>
            {attackMsg && (
              <div className="mt-3 rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success">
                {attackMsg}
              </div>
            )}
            <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg border border-card-border/60 bg-card/60 p-3 text-center">
              <div>
                <p className="text-body-sm font-medium text-muted">Automatic share</p>
                <p className="mt-1 font-semibold tabular-nums text-foreground">
                  {(attackInfo.plantSplitQuote.seizureFraction * 100).toFixed(
                    (attackInfo.plantSplitQuote.seizureFraction * 100) % 1 === 0 ? 0 : 1
                  )}
                  %
                </p>
              </div>
              <div className="border-x border-card-border/60 px-2">
                <p className="text-body-sm font-medium text-muted">Plants at risk</p>
                <p className="mt-1 font-semibold tabular-nums text-foreground">
                  {attackInfo.plantSplitQuote.plantsAtRisk.toLocaleString("en-US")}
                </p>
              </div>
              <div>
                <p className="text-body-sm font-medium text-muted">Success chance</p>
                <p className="mt-1 font-semibold tabular-nums text-foreground">
                  {(attackInfo.plantSplitQuote.successProbability * 100).toFixed(1)}%
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted">
                Committed: {formatAmount(attackInfo.plantSplitQuote.cashCostAnchor)} +{" "}
                {attackInfo.plantSplitQuote.marketingStrengthCost} MS, paid even on failure
              </p>
              <button
                type="button"
                onClick={() => setPlannerOpen(true)}
                className="rounded-lg border border-error/30 bg-error/10 px-4 py-2 text-sm font-medium text-error transition-colors hover:bg-error/20"
              >
                Plan sector split
              </button>
            </div>
          </div>
        )}
      </div>

      {attackInfo.plantSplitQuote && attackInfo.plantCount != null && (
        <PlantSplitPlannerModal
          open={plannerOpen}
          targetName={targetName}
          defenderPlantCount={attackInfo.plantCount}
          quote={attackInfo.plantSplitQuote}
          userLiquidCapitalAnchor={attackInfo.userLiquidCapital}
          userMarketingStrength={attackInfo.userMarketingStrength}
          submitting={attacking}
          errorMessage={attackError}
          onClose={() => {
            if (!attacking) setPlannerOpen(false);
          }}
          onConfirm={async () => {
            if (await onAttack()) setPlannerOpen(false);
          }}
        />
      )}
    </div>
  );
}
