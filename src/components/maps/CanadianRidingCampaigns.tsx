"use client";

import { useState } from "react";
import { apiErrorText } from "@/lib/errors/catalog";

export function CanadianRidingCampaigns({
  electionId,
  stateId,
  partyId,
  ridings,
  onCampaign,
}: {
  electionId: string;
  stateId: string;
  partyId: string;
  ridings: { id: string; name: string }[];
  onCampaign: () => void;
}) {
  const [selected, setSelected] = useState(ridings[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function campaign() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/country/ca/region/${stateId}/party/${partyId}/campaign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          electionId,
          ridingId: selected,
          planVersion: "2023",
          districtIndex: Number(selected.slice(-5)),
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(
          `Boost ${Number(data.boost).toFixed(1)}%, cost ${data.psCost} political strength`
        );
        onCampaign();
      } else setMessage(apiErrorText(data, "Campaign failed"));
    } catch {
      setMessage("Network error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 space-y-2 border-t border-card-border pt-3">
      <p className="text-xs text-muted">
        Party officers can campaign to change riding placement within their party&apos;s provincial
        seat allocation. Uses the same political strength cost, cap and decay as US district
        campaigns.
      </p>
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="canadian-campaign-riding">
          Federal riding
        </label>
        <select
          id="canadian-campaign-riding"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="max-w-full rounded border border-card-border bg-card px-2 py-1 text-sm"
        >
          {ridings.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !selected}
          onClick={campaign}
          className="rounded bg-accent px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Campaigning..." : "Campaign Here"}
        </button>
      </div>
      {message && (
        <p role="status" className="text-xs text-muted">
          {message}
        </p>
      )}
    </div>
  );
}
