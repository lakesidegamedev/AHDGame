"use client";

import { useEffect, useState } from "react";
import type { LeaderLegacyViewRow } from "@/lib/government/rules/leaderLegacy";

interface Props {
  countryCode: string;
  /** Only this party's legacies (a party page); omitted for the whole country. */
  partyId?: string | null;
  title?: string;
}

const signed = (value: number, digits = 1): string =>
  `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;

/**
 * Departed heads of government and how history judged them. A legacy gives its
 * party a small vote-share shift and a small approval shift that both fade, so
 * the panel shows what is still in force next to the score.
 */
export function LeaderLegacyPanel({ countryCode, partyId, title = "Leader legacies" }: Props) {
  const [rows, setRows] = useState<LeaderLegacyViewRow[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const query = partyId ? `?party=${encodeURIComponent(partyId)}` : "";
    fetch(`/api/country/${countryCode.toLowerCase()}/leader-legacy${query}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { legacies?: LeaderLegacyViewRow[] } | null) => {
        setRows(body?.legacies ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRows([]);
      });
    return () => controller.abort();
  }, [countryCode, partyId]);

  if (!rows || rows.length === 0) return null;

  return (
    <section
      data-testid="leader-legacy-panel"
      className="rounded-xl border border-card-border bg-card px-5 py-4 sm:px-6"
    >
      <h2 className="text-heading font-semibold text-foreground">{title}</h2>
      <ul className="mt-3 space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="space-y-1 text-body-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold text-foreground">{row.leaderName}</span>
              <span className="text-muted">
                {row.tierLabel}, legacy {signed(row.score, 0)}
              </span>
            </div>
            <p className="text-muted">
              {row.lawsEnacted} laws enacted
              {row.exitApproval != null ? `, approval ${row.exitApproval.toFixed(0)}% on exit` : ""}
              .
              {row.remaining > 0
                ? ` Still shifting the party's vote ${signed(row.votePct, 2)} points and its approval ${signed(row.approvalPoints, 1)} (${Math.round(row.remaining * 100)}% of the original).`
                : " The effect on the party has faded."}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
