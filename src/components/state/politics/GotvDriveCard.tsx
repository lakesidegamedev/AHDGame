"use client";

import Link from "next/link";
import { regionPartyUrl } from "@/lib/urls";

/**
 * Read-only summary of the viewer party's GOTV budget for this state.
 * Mutation lives on the State Party page; this card deep-links there instead
 * of duplicating the budget form.
 */
export function GotvDriveCard({
  countryCode,
  stateId,
  partyId,
  budgetPercent,
  targetCategory,
  targetGroup,
}: {
  countryCode: string;
  stateId: string;
  partyId: string;
  /** 0..25 percent of hourly revenue — `undefined` when no budget row exists. */
  budgetPercent: number | undefined;
  /** Demographic category the GOTV is targeting, if any. */
  targetCategory?: string;
  /** Specific group within `targetCategory`, if any. */
  targetGroup?: string;
}) {
  const url = regionPartyUrl(countryCode, stateId, partyId);
  const hasBudget = budgetPercent != null && budgetPercent > 0;

  return (
    <div className="rounded-xl border border-card-border bg-card p-5">
      <h3 className="text-body text-muted">GOTV drive</h3>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-heading-lg font-semibold tabular-nums">
          {budgetPercent != null ? `${budgetPercent.toFixed(1)}%` : "—"}
        </span>
        <span className="text-body-sm text-muted">of hourly revenue</span>
      </div>
      {hasBudget && targetCategory && (
        <p className="mt-1 text-xs">
          Targeting{" "}
          <span className="font-semibold">
            {targetGroup ? `${targetGroup} (${targetCategory})` : targetCategory}
          </span>
        </p>
      )}
      {!hasBudget && (
        <p className="mt-1 text-body-sm text-muted">No GOTV budget set for this state.</p>
      )}
      <Link
        href={url}
        className="mt-3 inline-block text-xs font-medium underline opacity-80 hover:opacity-100"
      >
        Adjust on state party page →
      </Link>
    </div>
  );
}
