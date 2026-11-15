"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useCountryDisplayName } from "@/contexts/RegisteredCountriesContext";
import type { CountryId } from "@/lib/constants/countriesCore";
import { CrisisThumb, SeverityTag, BAND_ROW_CLASS } from "@/components/crises/CrisisRowParts";
import { summarizeCrises, crisisPlaceLabel } from "@/lib/crises/rules/crisisRow";
import type { CrisisSeverity } from "@/lib/crises/severity";

export interface CrisisListRow {
  id: string;
  title: string;
  image: string;
  scope: "global" | "country" | "region";
  countryIds: string[];
  regionIds: string[];
  stage: string;
  band: CrisisSeverity;
  score: number;
  canRespond: boolean;
}

const EXPANDED_KEY = "ahd:crisisListExpanded";

function readExpanded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(EXPANDED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Every crisis the player cannot act on right now, folded to one row.
 * Collapsed by default so the player's own actions stay in view; the choice
 * is remembered per browser profile.
 */
export function CrisisCollapsedList({
  rows,
  regionNames,
  alsoRespondable = 0,
}: {
  rows: CrisisListRow[];
  regionNames: Record<string, string>;
  /** Crises with a response for this player that are shown as full cards above. */
  alsoRespondable?: number;
}) {
  const countryName = useCountryDisplayName();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(readExpanded());
  }, []);

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(EXPANDED_KEY, next ? "1" : "0");
      } catch {
        // Storage is optional.
      }
      return next;
    });
  }, []);

  if (rows.length === 0) return null;

  const place = (row: CrisisListRow) =>
    crisisPlaceLabel(row, {
      country: (id) => countryName(id as CountryId),
      region: (id) => regionNames[id] ?? id,
    });
  const summary = summarizeCrises(
    rows.map((r) => ({ title: r.title, band: r.band, canRespond: r.canRespond }))
  );
  const worst = rows[0];
  const respondable = summary.respondable + alsoRespondable;

  return (
    <section
      data-event-item="crisis"
      aria-label="Other active crises"
      className={`order-2 overflow-hidden rounded-lg border border-card-border bg-background/40 ${BAND_ROW_CLASS[summary.high > 0 ? "high" : "low"]}`}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-card-elevated/60"
      >
        <CrisisThumb src={worst.image} className="h-10 w-14" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{summary.headline}</span>
          <span className="block truncate text-xs text-muted">
            Worst: {worst.title}, {place(worst)}
            {respondable > 0 ? ` · ${respondable} you can respond to` : ""}
          </span>
        </span>
        {summary.high > 0 && <SeverityTag band="high" />}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {expanded && (
        <ul className="divide-y divide-card-border border-t border-card-border">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/world/crises/${row.id}`}
                className={`flex items-center gap-3 px-3 py-2 hover:bg-card-elevated/60 ${BAND_ROW_CLASS[row.band]}`}
              >
                <CrisisThumb src={row.image} className="h-9 w-12" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {row.title}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {place(row)} · {row.stage}
                  </span>
                </span>
                {row.canRespond ? (
                  <span className="shrink-0 text-xs font-medium text-success">You can respond</span>
                ) : (
                  <span className="hidden shrink-0 text-xs text-muted sm:inline">
                    No response for you
                  </span>
                )}
                <SeverityTag band={row.band} score={row.score} />
              </Link>
            </li>
          ))}
          <li className="px-3 py-2 text-xs">
            <Link href="/world/crises" className="text-primary hover:underline">
              Open the crisis board
            </Link>
          </li>
        </ul>
      )}
    </section>
  );
}
