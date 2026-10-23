"use client";

import { useState } from "react";
import { apiErrorText } from "@/lib/errors/catalog";
import type { SectorDetail } from "./CorporationPageTypes";
import { DenseSection, InlineStatus, SmallButton } from "./dense/DenseKit";

type Transition = NonNullable<SectorDetail["cutoverTransition"]>;
type TransitionReason = Transition["reason"];

const REASON_LABEL: Record<TransitionReason, string> = {
  zeroSales: "sold nothing",
  losing: "losing money",
  overBuilt: "over-built",
};

/**
 * The market-transition review for a CEO: every sector that lost money or sold
 * nothing since the market changed, with a one-click mothball while the free
 * window is open. Nothing happens unless the player chooses, so the card stays
 * out of the way when there is nothing to review.
 */
export function TransitionReviewCard({
  corpId,
  sectors,
  isCeo,
  onChanged,
}: {
  corpId: string;
  sectors: SectorDetail[];
  isCeo: boolean;
  onChanged?: () => void;
}) {
  const [mothballing, setMothballing] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [status, setStatus] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  const rows = sectors.flatMap((sector) => {
    const transition = sector.cutoverTransition;
    if (!transition || transition.converted || transition.mothballed) return [];
    return [{ sector, transition }];
  });

  if (!isCeo || rows.length === 0) return null;

  const turnsLeft = Math.min(...rows.map((row) => row.transition.turnsLeft));
  const zeroSales = rows.filter((row) => row.transition.reason === "zeroSales");
  const busy = bulkBusy || mothballing != null;

  const postMothball = async (sectorId: string) => {
    const res = await fetch(`/api/corporations/${corpId}/sectors/${sectorId}/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mothball" }),
    });
    if (!res.ok) throw new Error(apiErrorText(await res.json(), "Mothball failed"));
  };

  const mothballOne = async (sectorId: string) => {
    setMothballing(sectorId);
    setStatus(null);
    try {
      await postMothball(sectorId);
      onChanged?.();
      setStatus({ message: "Mothballed. No upkeep while the window is open.", tone: "success" });
    } catch (cause) {
      setStatus({
        message: cause instanceof Error ? cause.message : "Mothball failed",
        tone: "error",
      });
    } finally {
      setMothballing(null);
    }
  };

  const mothballZeroSales = async () => {
    setBulkBusy(true);
    setStatus(null);
    let succeeded = 0;
    for (const row of zeroSales) {
      try {
        await postMothball(row.sector._id);
        succeeded++;
      } catch {
        // Keep going: one failed sector should not stop the rest.
      }
    }
    setBulkBusy(false);
    if (succeeded > 0) onChanged?.();
    setStatus({
      message: `Mothballed ${succeeded} of ${zeroSales.length}.`,
      tone: succeeded === zeroSales.length ? "success" : "error",
    });
  };

  return (
    <DenseSection title="New market: sectors to review">
      <div className="space-y-2 py-1">
        <p className="text-xs text-muted">
          These sectors lost money or sold nothing since the market changed. For {turnsLeft} more
          turns you can mothball them with no upkeep, or convert them to another industry for free
          in the sector list. Nothing changes unless you choose.
        </p>
        {zeroSales.length >= 2 && (
          <SmallButton disabled={busy} onClick={() => void mothballZeroSales()}>
            {bulkBusy ? "Mothballing" : "Mothball all that sold nothing"}
          </SmallButton>
        )}
        <div className="divide-y divide-card-border">
          {rows.map(({ sector, transition }) => (
            <div
              key={sector._id}
              className="flex flex-wrap items-center justify-between gap-2 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">
                  {sector.sectorLabel} in {sector.stateName}
                </p>
                <p className="text-xs text-muted">{REASON_LABEL[transition.reason]}</p>
              </div>
              <SmallButton
                disabled={busy}
                onClick={() => void mothballOne(sector._id)}
                ariaLabel={`Mothball ${sector.sectorLabel} in ${sector.stateName}`}
              >
                {mothballing === sector._id ? "Mothballing" : "Mothball"}
              </SmallButton>
            </div>
          ))}
        </div>
        <InlineStatus message={status?.message} tone={status?.tone ?? "muted"} />
      </div>
    </DenseSection>
  );
}
