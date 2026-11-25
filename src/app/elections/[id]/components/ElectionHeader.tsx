"use client";

import React from "react";
import Link from "next/link";
import { PhaseTag, electionPageTitle } from "./ElectionDetailHelpers";
import type { ElectionDetail } from "./ElectionDetailTypes";

interface ElectionHeaderProps {
  election: ElectionDetail;
  electionYear: number | null;
  localInPrimary: boolean;
  localIsEnded: boolean;
  localIsUpcoming: boolean;
  canEnter: boolean;
  canWithdraw: boolean;
  actionLoading: boolean;
  onEnter: () => void;
  onWithdraw: () => void;
}

export function ElectionHeader({
  election,
  electionYear,
  localInPrimary,
  localIsEnded,
  localIsUpcoming,
  canEnter,
  canWithdraw,
  actionLoading,
  onEnter,
  onWithdraw,
}: ElectionHeaderProps) {
  const titleText = electionPageTitle(election, electionYear);

  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex items-center flex-wrap gap-3 mb-1">
          <h1 className="text-heading font-bold sm:text-display">{titleText}</h1>
          <PhaseTag
            inPrimary={localInPrimary}
            isEnded={localIsEnded}
            isUpcoming={localIsUpcoming}
          />
        </div>
        {election.incumbent && election.incumbent.running === false && (
          <p className="text-body text-muted" data-testid="incumbent-not-running">
            Sitting officeholder {election.incumbent.name} ({election.incumbent.party}) is not on
            the ballot
            {election.incumbent.notRunningReason ? `: ${election.incumbent.notRunningReason}` : ""}.
          </p>
        )}
        {election.electionType === "president" && (
          <p className="text-body text-muted">
            <Link
              href="/wiki/reference-offices"
              className="text-primary underline-offset-2 hover:underline"
            >
              What the presidency can do
            </Link>
            {" · "}
            <Link
              href="/guides/running-for-office"
              className="text-primary underline-offset-2 hover:underline"
            >
              How to run for president
            </Link>
          </p>
        )}
      </div>
      {election.myCharId && !localIsEnded && (
        <div className="shrink-0">
          {canEnter && (
            <button
              onClick={onEnter}
              disabled={actionLoading}
              className="rounded-lg bg-primary px-5 py-2.5 text-body font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:bg-card-border disabled:text-muted disabled:hover:bg-card-border"
            >
              {actionLoading ? "…" : "Enter race"}
            </button>
          )}
          {canWithdraw && (
            <button
              onClick={onWithdraw}
              disabled={actionLoading}
              className="rounded-lg border border-error/50 bg-error/10 px-5 py-2.5 text-body font-semibold text-error transition-colors hover:bg-error/20 disabled:opacity-50"
            >
              {actionLoading ? "…" : "Withdraw"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
