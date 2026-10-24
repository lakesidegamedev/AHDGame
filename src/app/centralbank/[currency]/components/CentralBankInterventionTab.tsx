"use client";

import { InlineError } from "@/components/ui/InlineError";
import { apiErrorText } from "@/lib/errors/catalog";
import { useState } from "react";
import {
  stabilizationBand,
  type DefencePreviewContext,
} from "@/lib/currency/intervention/rules/preview";
import { InterventionPreview } from "./InterventionPreview";
import { defenceBounds } from "@/lib/currency/intervention/rules/defence";
import { bandDefenceStatus } from "@/lib/currency/interventionBandStatus";
import type { CountryId } from "@/lib/constants/countries";
import { Button } from "@/components/ui";
import { CURRENCY_SYMBOLS, type CurrencyCode } from "@/lib/constants/currencies";
import { ForexSpreadStrengthControl } from "@/components/forex/ForexSpreadStrengthControl";
import { CB_TH, CentralBankSection } from "./CentralBankSection";

interface InterventionRecord {
  turn: number;
  direction: "buy" | "sell";
  reservesSpent: number;
  fundingSource: "forexRevenue" | "reserveBalance" | "spreadFeeReserves" | "mixed";
  resultingRate: number;
}

const FUNDING_SOURCE_LABELS: Record<string, string> = {
  forexRevenue: "Forex revenue pool",
  reserveBalance: "Reserve balance",
  spreadFeeReserves: "Spread fees",
  mixed: "Mixed",
};

interface InterventionPolicyView {
  floor: number;
  ceiling: number;
  maxSpendPerTurn?: number;
  setByCharacterName: string | null;
  setAtTurn: number | null;
  lastAdjustedAtTurn: number | null;
  recentInterventions: InterventionRecord[];
}

export interface ForexSpreadView {
  strength: number;
  min: number;
  max: number;
  default: number;
  cooldownTurns: number;
  turnsRemaining: number;
  nextChangeTurn: number;
  canEdit: boolean;
}

export interface InterventionData {
  previewContext?: DefencePreviewContext | null;
  fxRegime?: "float" | "band" | "peg";
  currencyCode: CurrencyCode | null;
  baseRate: number | null;
  currentRate: number | null;
  policy: InterventionPolicyView | null;
  forexRevenue: number | null;
  reserveBalance: number | null;
  forexSpread?: ForexSpreadView | null;
}

interface Props {
  countryId: CountryId;
  data: InterventionData;
  isChair: boolean;
  isAdmin: boolean;
  chairControlsLocked: boolean;
  currentTurn: number;
  onChanged: () => void;
}

const COOLDOWN_TURNS = 6;

export function CentralBankInterventionTab({
  countryId,
  data,
  isChair,
  isAdmin,
  chairControlsLocked,
  currentTurn,
  onChanged,
}: Props) {
  const [floor, setFloor] = useState<string>(data.policy ? String(data.policy.floor) : "");
  const [ceiling, setCeiling] = useState<string>(data.policy ? String(data.policy.ceiling) : "");
  const [budget, setBudget] = useState(
    data.policy?.maxSpendPerTurn !== undefined ? String(data.policy.maxSpendPerTurn) : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isPeg = data.fxRegime === "peg";
  const canEdit = !isPeg && ((isChair && !chairControlsLocked) || isAdmin);
  const currencySym = data.currencyCode ? (CURRENCY_SYMBOLS[data.currencyCode] ?? "") : "";
  const budgetValid =
    budget.trim() === "" || (Number.isFinite(Number(budget)) && Number(budget) >= 0);
  const inBand =
    data.policy && data.currentRate != null
      ? data.currentRate >= defenceBounds(data.policy).floor &&
        data.currentRate <= defenceBounds(data.policy).ceiling
      : null;

  const turnsSinceAdjusted =
    data.policy?.lastAdjustedAtTurn != null ? currentTurn - data.policy.lastAdjustedAtTurn : null;
  const cooldownRemaining =
    turnsSinceAdjusted !== null && turnsSinceAdjusted < COOLDOWN_TURNS
      ? COOLDOWN_TURNS - turnsSinceAdjusted
      : 0;
  const bandStatus =
    data.policy && data.currentRate != null
      ? bandDefenceStatus(data.currentRate, data.policy.floor, data.policy.ceiling)
      : { defending: false, turnsToReach: 0, unreachable: false, gapPct: 0 };

  const desiredFloor = parseFloat(floor);
  const desiredCeiling = parseFloat(ceiling);
  const bandValid =
    Number.isFinite(desiredFloor) &&
    Number.isFinite(desiredCeiling) &&
    desiredFloor > 0 &&
    desiredFloor < desiredCeiling;

  const isWiden =
    data.policy &&
    bandValid &&
    desiredFloor <= data.policy.floor &&
    desiredCeiling >= data.policy.ceiling &&
    ((budget.trim() === "" ? undefined : Number(budget)) === data.policy.maxSpendPerTurn ||
      (budget.trim() !== "" &&
        data.policy.maxSpendPerTurn !== undefined &&
        Number(budget) <= data.policy.maxSpendPerTurn));

  const submitLabel = data.policy ? (isWiden ? "Widen band" : "Narrow / shift band") : "Set band";

  async function submit(method: "POST" | "PATCH") {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/country/${countryId}/central-bank/intervention`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          floor: desiredFloor,
          ceiling: desiredCeiling,
          ...(budget.trim() === "" ? {} : { maxSpendPerTurn: Number(budget) }),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(apiErrorText(json, "Request failed."));
      } else {
        setSuccess(json.action === "widen" ? "Band widened." : "Band updated.");
        onChanged();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel() {
    if (!confirm("Cancel the active band? This is subject to the 6-turn cooldown.")) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/country/${countryId}/central-bank/intervention`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(apiErrorText(json, "Cancel failed."));
      } else {
        setSuccess("Band cancelled.");
        setFloor("");
        setCeiling("");
        onChanged();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-12">
      {data.forexSpread && (
        <ForexSpreadStrengthControl
          countryId={countryId}
          currencyCode={data.currencyCode}
          forexSpread={data.forexSpread}
          onChanged={onChanged}
        />
      )}
      <CentralBankSection title={isPeg ? "FX peg defence" : "FX intervention band"}>
        {isPeg && (
          <p className="mb-4 text-body text-muted">
            Peg defence follows the declared target and available reserves. Use Currency regime to
            change or end the commitment.
          </p>
        )}
        {data.currentRate != null && (
          <p className="mb-2 text-body text-muted">
            Current rate:{" "}
            <span className="font-mono text-foreground">
              {data.currentRate.toFixed(4)} {data.currencyCode} per internal unit
            </span>
          </p>
        )}
        {data.policy ? (
          <div className="mb-4 space-y-0.5 text-body">
            <p>
              {isPeg ? "Peg target:" : "Active band:"}{" "}
              <span className="font-mono">
                {isPeg
                  ? data.policy.floor.toFixed(4)
                  : `[${data.policy.floor.toFixed(4)}, ${data.policy.ceiling.toFixed(4)}]`}
              </span>
            </p>
            <p className="text-muted">
              Status:{" "}
              {inBand === null ? (
                "-"
              ) : inBand ? (
                <span className="text-foreground">In band</span>
              ) : (
                <span className="font-medium text-error">Defending (outside band)</span>
              )}
            </p>
            {bandStatus.defending && (
              <p className={bandStatus.unreachable ? "text-error" : "text-muted"}>
                {bandStatus.unreachable
                  ? `Corridor is ${(bandStatus.gapPct * 100).toFixed(1)}% away. Maximum-strength defence would need ${bandStatus.turnsToReach} turns, beyond a game year.`
                  : `Corridor is ${(bandStatus.gapPct * 100).toFixed(1)}% away, about ${bandStatus.turnsToReach} turn${bandStatus.turnsToReach === 1 ? "" : "s"} at maximum-strength defence.`}
              </p>
            )}
            <p className="text-muted">
              Set by {data.policy.setByCharacterName ?? "Unknown"}
              {data.policy.setAtTurn != null
                ? ` on turn ${data.policy.setAtTurn}`
                : " (turn unknown)"}
              {data.policy.lastAdjustedAtTurn != null &&
                data.policy.lastAdjustedAtTurn !== data.policy.setAtTurn &&
                ` · last adjusted turn ${data.policy.lastAdjustedAtTurn}`}
            </p>
            {!isPeg && cooldownRemaining > 0 && (
              <p className="text-warning">
                Cooldown: {cooldownRemaining} turn{cooldownRemaining === 1 ? "" : "s"} remaining
                before narrow/cancel
              </p>
            )}
          </div>
        ) : (
          <p className="mb-4 text-body text-muted">No active band.</p>
        )}

        {canEdit && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit(data.policy ? "PATCH" : "POST");
            }}
          >
            <p className="max-w-3xl text-body-sm text-muted">
              Lower numbers mean a stronger currency. Below the floor we sell home currency; above
              the ceiling we buy it. The band is a commitment, not a guaranteed exchange rate.
            </p>
            {data.previewContext && (
              <div className="flex flex-wrap gap-2">
                {(["current", "fundamentals"] as const).map((around) => (
                  <Button
                    key={around}
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      const suggested = stabilizationBand(data.previewContext!, around);
                      setFloor(String(suggested.floor));
                      setCeiling(String(suggested.ceiling));
                    }}
                  >
                    {around === "current" ? "Stabilize near current rate" : "Near fundamentals"}
                  </Button>
                ))}
              </div>
            )}
            <div className="grid max-w-md grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-body-sm text-muted">
                Floor
                <input
                  type="number"
                  step="0.0001"
                  min={0}
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                  className="rounded-md border border-card-border bg-background px-2 py-1 font-mono text-body text-foreground"
                  disabled={submitting}
                />
              </label>
              <label className="flex flex-col gap-1 text-body-sm text-muted">
                Ceiling
                <input
                  type="number"
                  step="0.0001"
                  min={0}
                  value={ceiling}
                  onChange={(e) => setCeiling(e.target.value)}
                  className="rounded-md border border-card-border bg-background px-2 py-1 font-mono text-body text-foreground"
                  disabled={submitting}
                />
              </label>
            </div>
            <label className="flex max-w-md flex-col gap-1 text-body-sm text-muted">
              Maximum reserve draw per turn ({data.currencyCode})
              <input
                type="number"
                min={0}
                step="any"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="Automatic: 10% of usable reserves"
                className="rounded-md border border-card-border bg-background px-2 py-1 font-mono text-body text-foreground"
                disabled={submitting}
              />
            </label>
            <p className="text-body-sm text-muted">
              Leave blank for the automatic budget. Zero stops spending without cancelling the
              commitment.
            </p>
            {data.previewContext && (
              <InterventionPreview
                context={data.previewContext}
                currency={data.currencyCode ?? ""}
                policy={{
                  floor: Number(floor),
                  ceiling: Number(ceiling),
                  ...(budget.trim() === "" ? {} : { maxSpendPerTurn: Number(budget) }),
                }}
              />
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={!bandValid || !budgetValid || submitting}>
                {submitLabel}
              </Button>
              {data.policy && (
                <Button type="button" variant="secondary" onClick={cancel} disabled={submitting}>
                  Cancel band
                </Button>
              )}
            </div>
          </form>
        )}

        <InlineError error={error} className="mt-2 text-body text-error" />
        {success && <p className="mt-2 text-body text-success">{success}</p>}
      </CentralBankSection>

      {(isChair || isAdmin) && data.forexRevenue != null && data.reserveBalance != null && (
        <CentralBankSection title="FX reserves" meta="Chair view">
          <dl className="grid max-w-md grid-cols-2 gap-x-4 gap-y-1 text-body">
            <dt className="text-muted">Forex revenue pool</dt>
            <dd className="text-right font-mono">
              {currencySym}
              {Math.round(data.forexRevenue).toLocaleString("en-US")}
            </dd>
            <dt className="text-muted">Reserve balance</dt>
            <dd className="text-right font-mono">
              {currencySym}
              {Math.round(data.reserveBalance).toLocaleString("en-US")}
            </dd>
            <dt className="font-semibold text-foreground">Usable to support the currency</dt>
            <dd className="text-right font-mono font-semibold">
              {currencySym}
              {data.previewContext
                ? Math.round(
                    data.previewContext.buyReservesAnchor * data.previewContext.homeRate
                  ).toLocaleString("en-US")
                : "Unavailable"}
            </dd>
            <dt className="font-semibold text-foreground">Usable to weaken the currency</dt>
            <dd className="text-right font-mono">
              {currencySym}
              {data.previewContext
                ? Math.round(
                    data.previewContext.sellReservesAnchor * data.previewContext.homeRate
                  ).toLocaleString("en-US")
                : "Unavailable"}
            </dd>
          </dl>
          <p className="mt-3 max-w-3xl text-body-sm text-muted">
            Supporting the currency spends foreign-currency reserves. Weakening it spends
            home-currency spread reserves first, then forex revenue, then the reserve balance.
            Intervention exchanges assets rather than destroying their full value. Spending the
            reserve balance also reduces the backing for lines of credit.
          </p>
        </CentralBankSection>
      )}

      {data.policy && (isChair || isAdmin) && data.policy.recentInterventions.length > 0 && (
        <CentralBankSection title="Recent interventions">
          <div className="overflow-x-auto">
            <table className="w-full text-body">
              <thead>
                <tr>
                  <th scope="col" className={CB_TH}>
                    Turn
                  </th>
                  <th scope="col" className={CB_TH}>
                    Direction
                  </th>
                  <th scope="col" className={CB_TH}>
                    Reserves spent
                  </th>
                  <th scope="col" className={CB_TH}>
                    Source
                  </th>
                  <th scope="col" className={CB_TH}>
                    Resulting rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...data.policy.recentInterventions].reverse().map((r) => (
                  <tr key={r.turn} className="border-b border-card-border/60">
                    <td className="py-2 pr-4 font-mono tabular-nums">{r.turn}</td>
                    <td className="py-2 pr-4">{r.direction}</td>
                    <td className="py-2 pr-4 font-mono tabular-nums">
                      {currencySym}
                      {Math.round(r.reservesSpent).toLocaleString("en-US")}
                    </td>
                    <td className="py-2 pr-4 text-muted">
                      {FUNDING_SOURCE_LABELS[r.fundingSource] ?? r.fundingSource}
                    </td>
                    <td className="py-2 pr-4 font-mono tabular-nums">
                      {r.resultingRate.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CentralBankSection>
      )}
    </div>
  );
}
