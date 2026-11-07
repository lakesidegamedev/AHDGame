"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui";
import { COUNTRY_CURRENCY_MAP, CURRENCY_SYMBOLS } from "@/lib/constants/currencies";
import type { CountryId } from "@/lib/constants/countriesCore";
import { ActingLockNote, useActingLock } from "./ActingLock";
import { apiErrorText } from "@/lib/errors/catalog";

const MATURITY_LABELS: Record<number, string> = {
  48: "1-Year",
  96: "2-Year",
  240: "5-Year",
  480: "10-Year",
  1440: "30-Year",
};
const CLASSIC_MATURITIES = [48, 96, 240];

interface Props {
  countryCode: string;
  positionId: string;
  canAct: boolean;
  currentProfile: Record<number, number> | null;
  /** Maturities this world allows; absent means the classic 1, 2 and 5 year set. */
  maturities?: number[];
  debtPrincipal: number;
  sovereignBondsOutstanding: number;
  onUpdate: () => void;
}

export function BondProfilePanel({
  countryCode,
  positionId,
  canAct: canActProp,
  currentProfile,
  maturities,
  debtPrincipal,
  sovereignBondsOutstanding,
  onUpdate,
}: Props) {
  // Compatibility hook; the current acting policy leaves this capability open.
  const actingLockReason = useActingLock("treasury");
  const canAct = canActProp && !actingLockReason;

  const countryId = countryCode.toUpperCase() as CountryId;
  const sym = CURRENCY_SYMBOLS[COUNTRY_CURRENCY_MAP[countryId]] ?? "$";
  const maturityOptions = useMemo(
    () =>
      (maturities ?? CLASSIC_MATURITIES).map((turns) => ({
        turns,
        label: MATURITY_LABELS[turns] ?? `${turns}-turn`,
      })),
    [maturities]
  );

  const initial = useMemo(() => {
    const base: Record<number, string> = {
      48: "25",
      96: "35",
      240: "40",
      480: "0",
      1440: "0",
    };
    if (currentProfile) {
      for (const [k, v] of Object.entries(currentProfile)) {
        base[Number(k)] = Math.round(v * 100).toString();
      }
    }
    return base;
  }, [currentProfile]);

  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const parsed = useMemo(() => {
    const out: Record<number, number> = {};
    let total = 0;
    for (const opt of maturityOptions) {
      const n = parseFloat(values[opt.turns] || "0");
      out[opt.turns] = isNaN(n) ? 0 : n;
      total += out[opt.turns];
    }
    return { out, total };
  }, [values, maturityOptions]);

  const isValid = parsed.total > 99.9 && parsed.total < 100.1;
  const isDirty = maturityOptions.some(
    (opt) => parseFloat(values[opt.turns] || "0") !== parseFloat(initial[opt.turns] || "0")
  );

  async function handleSave() {
    if (!isValid || !isDirty || !canAct) return;
    setSaving(true);
    setFeedback(null);

    const distribution: Record<number, number> = {};
    for (const opt of maturityOptions) {
      distribution[opt.turns] = parsed.out[opt.turns] / 100;
    }

    try {
      const res = await fetch(
        `/api/country/${countryCode}/executive/cabinet/${positionId}/bond-profile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(distribution),
        }
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFeedback({ type: "error", message: apiErrorText(json, "Failed to save") });
        return;
      }
      setFeedback({ type: "success", message: "Bond profile saved." });
      onUpdate();
    } catch {
      setFeedback({ type: "error", message: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  const gap = Math.max(0, debtPrincipal - sovereignBondsOutstanding);

  return (
    <section className="rounded-xl border border-card-border bg-card p-6 shadow-sm">
      <ActingLockNote reason={actingLockReason} />

      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">Sovereign bond maturity profile</h2>
        <p className="text-sm text-muted mt-1">
          Set the split of quarterly sovereign debt issuance across maturities. Values must sum to
          100%.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5 mb-4">
        {maturityOptions.map((opt) => (
          <label key={opt.turns} className="flex flex-col text-sm">
            <span className="text-muted mb-1">
              {opt.label} ({opt.turns} turns)
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={values[opt.turns]}
                onChange={(e) => setValues((prev) => ({ ...prev, [opt.turns]: e.target.value }))}
                disabled={!canAct || saving}
                className="w-24 rounded border border-card-border bg-card-elevated px-2 py-1 font-mono text-sm"
              />
              <span className="text-muted">%</span>
            </div>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-2 text-sm mb-4">
        <span className="text-muted">Total:</span>
        <span className={`font-mono font-semibold ${isValid ? "text-success" : "text-error"}`}>
          {parsed.total.toFixed(1)}%
        </span>
        {!isValid && <span className="text-error text-xs">Must sum to 100%</span>}
      </div>

      <div className="rounded-lg border border-card-border bg-background/60 p-4 mb-4">
        <div className="text-body-sm font-medium text-muted mb-2">Debt coverage</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-[11px] text-muted mb-0.5">National debt principal</div>
            <div className="font-semibold tabular-nums text-foreground">
              {sym}
              {Math.round(debtPrincipal).toLocaleString("en-US")}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted mb-0.5">Covered by bonds</div>
            <div className="font-semibold tabular-nums text-foreground">
              {sym}
              {Math.round(sovereignBondsOutstanding).toLocaleString("en-US")}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted mb-0.5">Uncovered gap</div>
            <div
              className={`font-semibold tabular-nums ${gap > 0 ? "text-warning" : "text-success"}`}
            >
              {sym}
              {Math.round(gap).toLocaleString("en-US")}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          disabled={!isValid || !isDirty || !canAct || saving}
          isLoading={saving}
          onClick={handleSave}
        >
          Save profile
        </Button>
        {feedback && (
          <span
            className={`text-sm ${feedback.type === "success" ? "text-success" : "text-error"}`}
          >
            {feedback.message}
          </span>
        )}
      </div>
    </section>
  );
}
