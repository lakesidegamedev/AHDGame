"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ElectricityNetworkMode } from "@/lib/electricityNetwork/rules/types";
export function ElectricityNetworkCard() {
  const [mode, setMode] = useState<ElectricityNetworkMode | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/admin/electricity-network", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw Error("Could not load electricity mode.");
        return r.json();
      })
      .then((v) => {
        if (active) setMode(v.mode);
      })
      .catch((e) => {
        if (active) setError(String(e.message));
      });
    return () => {
      active = false;
    };
  }, []);
  async function change(next: ElectricityNetworkMode) {
    if (next === mode || busy) return;
    if (
      next === "enforced" &&
      !confirm(
        "Enforce electricity connectivity, shared transmission capacity and losses? This changes electricity deliveries, prices and production. The catalog uses approximate aggregate limits. Review the shadow report first. Interrupted turns retain their frozen mode."
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/electricity-network", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      if (!r.ok) throw Error("Could not save electricity mode.");
      const value = await r.json();
      setMode(value.mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save mode.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-lg border border-card-border bg-background p-4 space-y-3">
      <div className="flex justify-between gap-3">
        <h3 className="font-semibold">Electricity network</h3>
        <span className="text-body-sm text-muted">{mode ?? "Loading"}</span>
      </div>
      <p className="text-body-sm text-muted">
        Off keeps current trading. Shadow compares connectivity, capacity and losses without
        applying them. Enforced applies all three. Default: Shadow Mode. Changes apply to the next
        unfrozen settlement.
      </p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["off", "Off"],
            ["shadow", "Shadow Mode"],
            ["enforced", "Enforced"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            disabled={!mode || busy}
            aria-pressed={mode === value}
            onClick={() => void change(value)}
            className={`rounded border px-3 py-1 text-body-sm disabled:opacity-50 ${mode === value ? "border-primary bg-primary/15 text-primary" : "border-card-border"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-error text-body-sm">
          {error}
        </p>
      )}
      <Link
        className="text-primary text-body-sm underline"
        href="/control/economy/electricity-network"
      >
        View electricity comparisons and connections
      </Link>
    </section>
  );
}
