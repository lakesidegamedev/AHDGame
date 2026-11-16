"use client";

import { useState, useEffect, useCallback } from "react";
import { apiErrorText } from "@/lib/errors/catalog";

export function LabourAdminPanel() {
  const [loading, setLoading] = useState(true);

  // Minimum wage (per-country Kaitz ratio).
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [country, setCountry] = useState("US");
  const [kaitz, setKaitz] = useState(0.4);
  const [mwSaving, setMwSaving] = useState(false);
  const [mwMessage, setMwMessage] = useState("");

  const fetchStatus = useCallback(async () => {
    try {
      const mwRes = await fetch("/api/admin/config/minimum-wage");
      if (mwRes.ok) setRatios(((await mwRes.json()) as { ratios: Record<string, number> }).ratios);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleSetMinWage = async () => {
    setMwSaving(true);
    setMwMessage("");
    try {
      const res = await fetch("/api/admin/config/minimum-wage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryId: country.trim().toUpperCase(), kaitzRatio: kaitz }),
      });
      const data = (await res.json()) as {
        error?: string;
        countryId?: string;
        kaitzRatio?: number;
      };
      if (!res.ok) {
        setMwMessage(`Error: ${apiErrorText(data, "Failed to set")}`);
        return;
      }
      setMwMessage(
        `${data.countryId}: minimum wage set to ${Math.round((data.kaitzRatio ?? 0) * 100)}% of median.`
      );
      await fetchStatus();
    } catch {
      setMwMessage("Error: Network error");
    } finally {
      setMwSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-card-border bg-card p-6 shadow-card">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted">Loading labour settings…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── Labour system mode ─── */}
      {/* ─── Minimum wage (per country) ─── */}
      <div className="rounded-xl border border-card-border bg-card p-6 shadow-card">
        <h3 className="mb-1 text-sm font-semibold">Minimum wage</h3>
        <p className="mb-4 text-xs leading-relaxed text-muted">
          Per-country Kaitz ratio (minimum wage ÷ median wage), 0–1. Floors low-pay sectors&apos;
          labor cost. 0 = no floor.
        </p>

        {Object.keys(ratios).length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {Object.entries(ratios).map(([cid, r]) => (
              <span
                key={cid}
                className="rounded-md border border-card-border bg-background px-2.5 py-1 text-xs"
              >
                <span className="font-semibold">{cid}</span>: {Math.round(r * 100)}%
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted">
            Country
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="mt-1 block w-20 rounded-lg border border-card-border bg-background px-3 py-2 text-sm uppercase focus:border-primary/60 focus:outline-none"
            />
          </label>
          <label className="text-xs text-muted">
            Kaitz ratio
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={kaitz}
              onChange={(e) => setKaitz(Math.max(0, Math.min(1, Number(e.target.value))))}
              className="mt-1 block w-24 rounded-lg border border-card-border bg-background px-3 py-2 text-sm focus:border-primary/60 focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleSetMinWage()}
            disabled={mwSaving || !country.trim()}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {mwSaving ? "Saving…" : "Set"}
          </button>
        </div>
        {mwMessage ? (
          <p
            className="mt-3 text-xs"
            role="status"
            style={{
              color: mwMessage.startsWith("Error") ? "var(--destructive)" : "var(--success)",
            }}
          >
            {mwMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}
