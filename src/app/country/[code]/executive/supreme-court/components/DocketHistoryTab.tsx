"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui";

interface DocketCaseRow {
  caseKey: string;
  title: string;
  axis: "economic" | "social";
  decisionYear: number;
  isSurprise?: boolean;
  outcome?: "affirmed" | "diverged";
  decidedAtTurn?: number;
  decisionSeatedFor?: number;
  decisionSeatedAgainst?: number;
}

interface DocketResponse {
  cases: DocketCaseRow[];
  upcomingCases?: (Pick<DocketCaseRow, "caseKey" | "title" | "axis" | "decisionYear"> & {
    hearingDueTurn?: number;
  })[];
  proceduralOnly?: boolean;
}

/**
 * What the outcome badges mean and how cases reach the Court. Shown with the
 * list and with the empty state, so a player never meets "Affirmed history" or
 * "Diverged" without a definition.
 */
export function DocketExplainer() {
  return (
    <div className="space-y-1 text-body-sm text-muted">
      <p>
        <span className="font-semibold text-foreground">Affirmed history:</span> the seated
        justices&apos; majority on the case&apos;s axis matched the real ruling, so history plays
        out as it did. <span className="font-semibold text-warning">Diverged:</span> the majority
        leaned the other way, so the Court ruled differently and the alternate outcome changes
        policy, national and state metrics, and regional lean.
      </p>
      <p>
        Cases resolve automatically using the seated justices&apos; recorded positions. Player
        justices do not cast votes on individual cases. Some landmark outcomes are fixed to history.
      </p>
      <p>
        Players cannot file cases. Historical scenarios may schedule landmark cases. Unscripted
        cases can appear during play. You shape rulings through who sits on the bench: the President
        nominates and the Senate confirms.
      </p>
    </div>
  );
}

export function DocketHistoryTab({ countryCode }: { countryCode: string }) {
  const [docket, setDocket] = useState<DocketResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/country/${countryCode}/scotus/cases`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((json: DocketResponse) => {
        if (!cancelled) setDocket(json);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load the docket.");
      });
    return () => {
      cancelled = true;
    };
  }, [countryCode]);

  if (error) {
    return (
      <div className="rounded-xl border border-error/30 bg-error/10 p-4 text-body text-error">
        {error}
      </div>
    );
  }

  if (docket === null) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const { cases, upcomingCases = [], proceduralOnly } = docket;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-body-lg font-semibold text-foreground">Upcoming cases</h2>
        {upcomingCases.length === 0 && (
          <p className="rounded-xl border border-card-border bg-card p-4 text-body text-muted">
            {proceduralOnly
              ? "No cases are awaiting a hearing. New cases can arise during play and get a hearing date when they are filed."
              : "No cases are currently on the docket."}
          </p>
        )}
        {upcomingCases.map((c) => (
          <div key={c.caseKey} className="rounded-xl border border-card-border bg-card p-4">
            <p className="text-body font-semibold text-foreground">{c.title}</p>
            <p className="mt-0.5 text-body-sm text-muted">
              {c.hearingDueTurn != null
                ? `Hearing on Turn ${c.hearingDueTurn}`
                : `Scheduled for ${c.decisionYear}`}
              {" · "}
              {c.axis === "economic" ? "Economic" : "Social"} case
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-body-lg font-semibold text-foreground">Decided cases</h2>
        {cases.length === 0 && (
          <p className="rounded-xl border border-card-border bg-card p-4 text-body text-muted">
            No rulings have been recorded.
          </p>
        )}
        {cases.map((c) => {
          const diverged = c.outcome === "diverged";
          return (
            <div
              key={c.caseKey}
              className="flex flex-col gap-2 rounded-xl border border-card-border bg-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-body font-semibold text-foreground">{c.title}</p>
                <p className="mt-0.5 text-body-sm text-muted">
                  {c.decisionYear} · {c.axis === "economic" ? "Economic" : "Social"} axis
                  {c.decisionSeatedFor != null && c.decisionSeatedAgainst != null && (
                    <>
                      {" "}
                      · {c.decisionSeatedFor}-{c.decisionSeatedAgainst} majority
                    </>
                  )}
                </p>
              </div>
              <span
                className={`shrink-0 self-start rounded-full border px-2.5 py-1 text-body-sm font-semibold uppercase tracking-wide sm:self-center ${
                  diverged
                    ? "border-warning/40 bg-warning/10 text-warning"
                    : "border-card-border bg-card-elevated text-muted"
                }`}
              >
                {c.isSurprise ? "Ruling recorded" : diverged ? "Diverged" : "Affirmed history"}
              </span>
            </div>
          );
        })}
      </section>
    </div>
  );
}
