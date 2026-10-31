"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { PhaseTag, electionPageTitle } from "./ElectionDetailHelpers";
import type { ElectionDetail } from "./ElectionDetailTypes";

// The statutory map inside the collapsed details is Japan-only and reads the
// 72 KB 1994 constituency table, so it loads after the header paints.
const JpStatutoryConstituencyList = dynamic(
  () => import("./JpStatutoryConstituencyList").then((m) => m.JpStatutoryConstituencyList),
  {
    loading: () => <div className="mt-2 h-24 animate-pulse rounded bg-muted" aria-hidden="true" />,
  }
);

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
  const t = useTranslations("elections.huModernByElection");
  const titleText = electionPageTitle(election, electionYear);

  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex items-center flex-wrap gap-3 mb-1">
          <h1 className="text-2xl font-bold sm:text-3xl">{titleText}</h1>
          <PhaseTag
            inPrimary={localInPrimary}
            isEnded={localIsEnded}
            isUpcoming={localIsUpcoming}
          />
        </div>
        {election.electionType === "president" && (
          <p className="text-sm text-muted">
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
        {election.hungarianModernByElection && (
          <p className="text-sm text-muted">
            {t("description", { district: election.hungarianModernByElection.districtId })}
          </p>
        )}
        {election.japanShugiinRules?.ruleVersion === "mixed-1994-v1" && (
          <div className="mt-2 max-w-3xl text-sm text-muted">
            <p>
              This 500-seat chamber has {election.japanShugiinRules.districtSeats} district
              constituencies and {election.japanShugiinRules.listSeats} regional party-list seats.
              Constituency and list nominations are separate; a direct winner cannot take a second
              list seat.
            </p>
            <details className="mt-1">
              <summary className="cursor-pointer font-medium">
                1994 statutory constituency map
              </summary>
              <JpStatutoryConstituencyList regionId={election.state} />
            </details>
          </div>
        )}
      </div>
      {election.myCharId && !localIsEnded && (
        <div className="shrink-0">
          {canEnter && (
            <button
              onClick={onEnter}
              disabled={actionLoading}
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {actionLoading ? "…" : "Enter race"}
            </button>
          )}
          {canWithdraw && (
            <button
              onClick={onWithdraw}
              disabled={actionLoading}
              className="rounded-lg border border-error/50 bg-error/10 px-5 py-2.5 text-sm font-semibold text-error transition-colors hover:bg-error/20 disabled:opacity-50"
            >
              {actionLoading ? "…" : "Withdraw"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
