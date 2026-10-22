"use client";

import { useEffect, useState } from "react";
import { KVList, KVRow } from "../dense/DenseKit";

interface TargetSummary {
  sectorCount: number;
  headquarters: string | null;
}

/**
 * What can be known about a target before an offer: its sector count and
 * headquarters (a private target's rows stay listed with their figures
 * stripped, so the count is still right), and the offer against this
 * corporation's cash. Targets are private, and their value is only computed
 * when an offer is made, so nothing here estimates it.
 */
export function DealPreview({
  targetId,
  targetName,
  offerLocal,
  cashLocal,
  fmtLocal,
}: {
  targetId: string;
  targetName: string;
  /** The offer as typed, in this corporation's currency; null when empty. */
  offerLocal: number | null;
  cashLocal: number;
  /** Formats an amount in this corporation's currency. */
  fmtLocal: (local: number) => string;
}) {
  const [summary, setSummary] = useState<TargetSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/corporations/${targetId}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("load");
        const data = (await res.json()) as {
          corporation?: { headquartersStateName?: string | null };
          sectors?: unknown[];
        };
        setSummary({
          sectorCount: Array.isArray(data.sectors) ? data.sectors.length : 0,
          headquarters: data.corporation?.headquartersStateName ?? null,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [targetId]);

  const gap = offerLocal != null ? Math.max(0, offerLocal - cashLocal) : 0;

  return (
    <section
      aria-label={`${targetName} preview`}
      className="max-w-md rounded-[var(--corp-rad,6px)] border border-card-border bg-card-muted/40 px-3 py-2"
    >
      <KVList>
        <KVRow
          label="Sectors"
          value={summary ? summary.sectorCount.toLocaleString("en-US") : failed ? "n/a" : "..."}
        />
        <KVRow
          label="Headquarters"
          value={summary ? (summary.headquarters ?? "n/a") : failed ? "n/a" : "..."}
          mono={false}
        />
        <KVRow label="Your cash" value={fmtLocal(cashLocal)} />
        {offerLocal != null && <KVRow label="Offer" value={fmtLocal(offerLocal)} />}
        {gap > 0 && (
          <KVRow
            label="Short by"
            value={<span className="text-warning">{fmtLocal(gap)}</span>}
            title="The offer is larger than this corporation's cash."
          />
        )}
      </KVList>
    </section>
  );
}
