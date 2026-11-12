"use client";

import { useState } from "react";
import { getMessageStyle } from "@/lib/utils/formatters";
import { apiErrorText } from "@/lib/errors/catalog";

/**
 * Reseed targets. Countries are those with a Layer-1 model plus US; eras match
 * `EraId`. The endpoint validates both, so an unsupported pair fails loudly
 * rather than silently seeding the default.
 */
const RESEED_COUNTRIES = ["US", "UK", "DE", "RU", "DD", "JP", "IE", "BR", "CN", "NG"] as const;
const RESEED_ERAS = ["1953", "1979", "1991", "1999", "2007", "2019", "2023", "2027"] as const;

/** Reseed and overwrite-defaults tools. Region electorates come from the Layer-1 census. */
export function DemographicsManager() {
  const [reseedCountry, setReseedCountry] = useState<string>("US");
  const [reseedEra, setReseedEra] = useState<string>("2019");
  const [reseedLoading, setReseedLoading] = useState(false);
  const [reseedMessage, setReseedMessage] = useState("");
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [overwriteConfirmText, setOverwriteConfirmText] = useState("");
  const [overwriteLoading, setOverwriteLoading] = useState(false);
  const [overwriteMessage, setOverwriteMessage] = useState("");

  const closeOverwrite = () => {
    setShowOverwriteConfirm(false);
    setOverwriteConfirmText("");
    setOverwriteMessage("");
  };

  const handleReseedDemographics = async () => {
    setReseedLoading(true);
    setReseedMessage("");
    try {
      // Endpoint defaults to US/2019 without a body; send the target explicitly so non-US backfills work.
      const res = await fetch("/api/admin/demographics/reseed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryId: reseedCountry, era: reseedEra }),
      });
      const data = await res.json();
      setReseedMessage(res.ok ? `✓ ${data.message}` : `✗ ${apiErrorText(data, "Reseed failed")}`);
    } catch {
      setReseedMessage("✗ Network error");
    } finally {
      setReseedLoading(false);
    }
  };

  const handleOverwriteDefaults = async () => {
    if (overwriteConfirmText !== "OVERWRITE") {
      setOverwriteMessage("✗ Please type OVERWRITE to confirm");
      return;
    }
    setOverwriteLoading(true);
    setOverwriteMessage("");
    try {
      const res = await fetch("/api/admin/demographics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmText: overwriteConfirmText }),
      });
      const data = await res.json();
      if (res.ok) {
        setOverwriteMessage(`✓ ${data.message}`);
        setShowOverwriteConfirm(false);
        setOverwriteConfirmText("");
      } else {
        setOverwriteMessage(`✗ ${apiErrorText(data, "Request failed")}`);
      }
    } catch {
      setOverwriteMessage("✗ Network error");
    } finally {
      setOverwriteLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-card-border bg-card p-6">
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted" htmlFor="reseed-country">
              Reseed target
            </label>
            <select
              id="reseed-country"
              value={reseedCountry}
              onChange={(e) => setReseedCountry(e.target.value)}
              className="rounded-lg border border-card-border bg-background px-2 py-2 text-sm"
            >
              {RESEED_COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              id="reseed-era"
              aria-label="Reseed era"
              value={reseedEra}
              onChange={(e) => setReseedEra(e.target.value)}
              className="rounded-lg border border-card-border bg-background px-2 py-2 text-sm"
            >
              {RESEED_ERAS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleReseedDemographics}
            disabled={reseedLoading}
            className="rounded-lg border border-green-500/50 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-400 hover:bg-green-500/20 disabled:opacity-50 transition-colors"
            title="Re-derive demographics and region leans for the selected country and era. Snapshots before writing."
          >
            {reseedLoading ? "Reseeding..." : `Reseed ${reseedCountry} ${reseedEra}`}
          </button>
          {reseedMessage && (
            <span
              className={`text-sm ${reseedMessage.startsWith("✓") ? "text-green-400" : "text-red-400"}`}
            >
              {reseedMessage}
            </span>
          )}
        </div>

        {/* Overwrite Defaults — Danger Zone accordion */}
        <details className="group mt-6 border-t border-card-border pt-4">
          <summary className="cursor-pointer list-none flex items-center gap-2 text-xs font-medium text-muted hover:text-foreground py-1 select-none">
            <svg
              className="h-3 w-3 transition-transform group-open:rotate-90"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Danger zone
          </summary>
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <p className="text-sm font-medium text-red-400 mb-1">Overwrite default demographics</p>
            <p className="text-sm text-muted mb-4">
              Save current demographics as the new defaults. When the game is reset, demographics
              will revert to these values.
            </p>

            {!showOverwriteConfirm ? (
              <button
                onClick={() => setShowOverwriteConfirm(true)}
                className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700"
              >
                Overwrite default demographics
              </button>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-orange-500/30 bg-orange-500/20 p-4">
                  <p className="mb-3 text-sm font-medium text-orange-300">
                    This will save all current state demographics as the new defaults. These values
                    will be used when the game is reset.
                  </p>
                  <div className="mb-3">
                    <label className="mb-1 block text-sm text-muted">
                      Type <span className="font-mono font-bold text-orange-400">OVERWRITE</span> to
                      confirm:
                    </label>
                    <input
                      type="text"
                      value={overwriteConfirmText}
                      onChange={(e) => setOverwriteConfirmText(e.target.value)}
                      className="w-48 rounded-lg border border-card-border bg-background px-3 py-2 text-sm font-mono"
                      placeholder="OVERWRITE"
                      disabled={overwriteLoading}
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleOverwriteDefaults}
                      disabled={overwriteLoading || overwriteConfirmText !== "OVERWRITE"}
                      className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:opacity-50"
                    >
                      {overwriteLoading ? "Saving..." : "Confirm overwrite"}
                    </button>
                    <button
                      onClick={() => closeOverwrite()}
                      disabled={overwriteLoading}
                      className="rounded-lg border border-card-border px-4 py-2 text-sm font-medium transition-colors hover:bg-background disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {overwriteMessage && (
              <div className={`mt-4 rounded-lg p-3 text-sm ${getMessageStyle(overwriteMessage)}`}>
                {overwriteMessage}
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
