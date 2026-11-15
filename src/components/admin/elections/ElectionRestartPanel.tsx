"use client";

import { useState } from "react";
import { apiErrorText } from "@/lib/errors/catalog";

const BUTTON_CLASS =
  "rounded-lg border border-card-border bg-card px-4 py-2 text-sm font-medium hover:bg-background disabled:opacity-50 transition-colors";

const SPAWN_BUTTONS = [
  {
    key: "president",
    path: "us",
    label: "Spawn president election",
    help: "Creates a presidential election if none is currently active.",
  },
  {
    key: "uk",
    path: "uk",
    label: "Spawn UK elections",
    help: "Spawn any missing UK Commons, Regional Council, and Governor elections. Safe after seeding UK data.",
  },
  {
    key: "jp",
    path: "jp",
    label: "Spawn JP elections",
    help: "Spawn any missing JP Shugiin, Sangiin, and Governor elections. Safe after seeding JP data.",
  },
  {
    key: "de",
    path: "de",
    label: "Spawn DE elections",
    help: "Spawn any missing DE Bundestag elections. Safe after seeding DE data.",
  },
  {
    key: "cn",
    path: "cn",
    label: "Spawn CN elections",
    help: "Spawn any missing CN NPC Delegate, Provincial Congress, and Governor elections. Safe after seeding CN data.",
  },
  {
    key: "br",
    path: "br",
    label: "Spawn BR elections",
    help: "Spawn any missing BR elections. Safe after seeding BR data.",
  },
  {
    key: "ie",
    path: "ie",
    label: "Spawn IE elections",
    help: "Spawn any missing IE elections. Safe after seeding IE data.",
  },
] as const;

export function ElectionRestartPanel() {
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const anyBusy = Object.values(busy).some(Boolean);

  async function post(key: string, url: string) {
    setBusy((b) => ({ ...b, [key]: true }));
    setResult(null);
    try {
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      setResult({
        ok: res.ok && data.success,
        message: data.message ?? apiErrorText(data, "Unknown response"),
      });
    } catch {
      setResult({ ok: false, message: "Network error" });
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  async function handleSyncDate() {
    if (
      !confirm(
        "Reset and Reinitialize All Elections will:\n" +
          "• Reset turn to 1, year to 2020 (starting year)\n" +
          "• Delete ALL elections, candidates, vote tallies, and campaigns\n" +
          "• Recreate elections with correct time scales (48 turns = 1 year):\n" +
          "  House→2022 (turn 144), Senate Class 3→2022, Class 1→2024, Class 2→2026\n" +
          "  Governor→2024 (turn 240), State Senate→2024, President→2024 (full primary)\n" +
          "  UK Commons→Jul 2024 (turn 219), UK Regional Council→Jul 2024 (synchronized)\n" +
          "  JP Shugiin→2024 (turn 240), JP Sangiin Class 1→Jul 2022 (turn 123), Class 2→Jul 2025 (turn 267)\n" +
          "  JP Governor→2024 (turn 240)\n" +
          "• NO elections occur in 2020\n" +
          "• All primaries open immediately (zero-gap timing — no upcoming state)\n" +
          "• Presidential race has a full primary phase — candidates can enter normally\n\n" +
          "This cannot be undone. Continue?"
      )
    ) {
      return;
    }
    await post("sync", "/api/admin/elections/sync-date");
  }

  return (
    <div className="rounded-xl border border-card-border bg-card p-6">
      {/* Tier 1 — Safe actions */}
      <div className="flex flex-wrap gap-6 mb-6">
        <div>
          <button
            onClick={() => post("restart", "/api/admin/elections/restart")}
            disabled={anyBusy}
            className={BUTTON_CLASS}
          >
            {busy.restart ? "Checking…" : "Spawn missing elections"}
          </button>
          <p className="text-xs text-muted mt-1.5 max-w-xs">
            Scans all states and fills any elections that should exist but aren&apos;t running. Safe
            to run at any time — won&apos;t duplicate existing races.
          </p>
        </div>

        {SPAWN_BUTTONS.map(({ key, path, label, help }) => (
          <div key={key}>
            <button
              onClick={() => post(key, `/api/admin/elections/spawn/${path}`)}
              disabled={anyBusy}
              className={BUTTON_CLASS}
            >
              {busy[key] ? "…" : label}
            </button>
            <p className="text-xs text-muted mt-1.5 max-w-xs">{help}</p>
          </div>
        ))}
      </div>

      <hr className="border-card-border my-2" />

      {/* Tier 2 — Destructive action */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex items-start gap-3 mb-3">
          <svg
            className="h-4 w-4 text-amber-400 mt-0.5 shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-400 mb-2">
              Reset and reinitialize all elections
            </p>
            <ul className="text-xs text-muted space-y-0.5 list-disc list-inside">
              <li>Resets turn to 1, year to 2020</li>
              <li>Deletes ALL elections, candidates, vote tallies, and campaigns</li>
              <li>Recreates with correct time scales (48 turns = 1 year)</li>
              <li>No elections in 2020 — all anchor to their next real-world election year</li>
              <li>House → 2022 (turn 144) · Gov/State Senate/President → 2024 (turn 240)</li>
              <li>Senate: Class 3 → 2022 · Class 1 → 2024 · Class 2 → 2026</li>
              <li>UK Commons/Regional Council → Jul 2024 (turn 219, synchronized)</li>
              <li>
                JP Shugiin → 2024 (turn 240) · JP Sangiin Class I → Jul 2022 (turn 123), Class II →
                Jul 2025 (turn 267)
              </li>
              <li>JP Governor → 2024 (turn 240)</li>
              <li>All primaries open immediately — zero-gap timing, no upcoming state</li>
              <li>Presidential race has a full primary phase — candidates can enter normally</li>
            </ul>
          </div>
        </div>
        <button
          onClick={handleSyncDate}
          disabled={busy.restart || busy.sync}
          className="rounded-lg border border-amber-500/50 bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/30 disabled:opacity-50 transition-colors"
        >
          {busy.sync ? "Resetting…" : "Reset and reinitialize all elections"}
        </button>
      </div>

      {result && (
        <div
          className={`mt-4 rounded-lg p-3 text-sm ${result.ok ? "bg-green-500/10 border border-green-500/30 text-green-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}
        >
          {result.message}
        </div>
      )}
    </div>
  );
}
