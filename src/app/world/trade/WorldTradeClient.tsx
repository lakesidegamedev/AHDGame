"use client";

import { useState } from "react";
import type { WorldTradeLedger } from "@/lib/trade/queries/worldTradeLedger";
import LedgerMasthead from "./components/LedgerMasthead";
import NationsView from "./components/NationsView";
import CommoditiesView from "./components/CommoditiesView";
import BilateralView from "./components/BilateralView";
import MatrixView from "./components/MatrixView";
import MapView from "./components/MapView";
import RestrictionsView from "./components/RestrictionsView";

/**
 * World Trade Ledger panel.
 *
 * Near-empty on a fresh world is expected, not a trade-engine bug. In the
 * early game almost nobody owns corporate sectors, so per-country
 * commodity supply sits at the BASE_COMMODITY_SUPPLY_DEMAND stabilizer
 * (~50k) for most goods, real production is near zero, and little clears.
 * Unowned sectors carry revenue but do NOT feed commodity S/D. Trade fills
 * in as players buy and build sectors.
 *
 * A livelier turn-1 ledger is a commodity-system fix (e.g. unowned sectors
 * contributing baseline supply), not a fix here, and needs its own pricing
 * pass. See scripts/debug/trade-turn2-flow-diag.ts for the diagnostic.
 */

type View = "nations" | "commodities" | "bilateral" | "matrix" | "map" | "restrictions";

const TABS: Array<{ id: View; label: string }> = [
  { id: "nations", label: "By nation" },
  { id: "commodities", label: "By commodity" },
  { id: "bilateral", label: "Bilateral" },
  { id: "matrix", label: "Trade matrix" },
  { id: "map", label: "World map" },
  { id: "restrictions", label: "Restrictions" },
];

const NOTES: Record<View, string> = {
  nations: "Net exports per nation · all markets · settled per the viewer's currency",
  commodities: "Tradeable goods · ranked by world traded volume",
  bilateral: "Pick a reporter and partner to settle their account",
  matrix: "Each cell: row nation's net balance vs. the column nation",
  map: "Click any market to isolate its trade flows · click again to release",
  restrictions: "Active embargoes and tariffs in force · grouped by the nation imposing them",
};

export default function WorldTradeClient({ ledger }: { ledger: WorldTradeLedger | null }) {
  const [view, setView] = useState<View>("nations");

  if (!ledger) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-6xl px-4 py-16 text-center text-muted">
          No trade data yet — the first ledger publishes after the next turn.
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <LedgerMasthead ledger={ledger} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Trade views"
            className="inline-flex flex-wrap gap-1 rounded-lg border border-card-border bg-card p-1"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={view === t.id}
                onClick={() => setView(t.id)}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                  view === t.id
                    ? "bg-primary/15 text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="text-[11.5px] text-muted">{NOTES[view]}</span>
        </div>

        {view === "nations" && <NationsView ledger={ledger} />}
        {view === "commodities" && <CommoditiesView ledger={ledger} />}
        {view === "bilateral" && <BilateralView ledger={ledger} />}
        {view === "matrix" && <MatrixView ledger={ledger} />}
        {view === "map" && <MapView ledger={ledger} />}
        {view === "restrictions" && <RestrictionsView ledger={ledger} />}
      </main>
    </div>
  );
}
