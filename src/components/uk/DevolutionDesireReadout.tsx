"use client";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { useTranslations } from "next-intl";
import type { DevolutionPolicy } from "@/lib/db/types/governorOfficeState";
import type { IndependenceDesireDriftPerRegion } from "@/lib/governorOffice/devolution/rules";
import {
  forecastIndependenceDesire,
  MEAN_REVERSION_TARGET,
} from "@/lib/governorOffice/devolution/rules";
export type DesireReadoutData = Pick<
  IndependenceDesireDriftPerRegion,
  "stateId" | "previous" | "trend" | "policy" | "westminsterPolicy" | "drivers" | "delta" | "inputs"
>;
function formatDesireDrift(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}
const QUEBEC_STANCE_KEYS = {
  anti: "federalist",
  pro: "autonomist",
  independence: "sovereignty",
} as const satisfies Record<DevolutionPolicy, string>;
export function stanceMessageKey(stateId: string, policy: DevolutionPolicy) {
  if (stateId === "CA_QC") return QUEBEC_STANCE_KEYS[policy];
  return policy === "independence" && stateId === "NIR" ? "reunification" : policy;
}
/** Message keys that name the two governments, by region. */
function readoutKeys(stateId: string) {
  if (stateId === "CA_QC")
    return {
      desire: "sovereigntyDesire",
      nationalStance: "ottawaStance",
      regionalStance: "premierStance",
      regionalPolicy: "premierPolicy",
      nationalPolicy: "ottawaPolicy",
      nationalApproval: "ottawaApproval",
      inflation: "canadaInflation",
      policyHelp: "quebecPolicyHelp",
    } as const;
  return {
    desire: stateId === "NIR" ? "reunificationDesire" : "independenceDesire",
    nationalStance: "westminsterStance",
    regionalStance: "fmStance",
    regionalPolicy: "regionalPolicy",
    nationalPolicy: "nationalPolicy",
    nationalApproval: "nationalApproval",
    inflation: "inflation",
    policyHelp: "policyHelp",
  } as const;
}
/** Shared by the UK Executive and each regional head of government's office. */
export function DevolutionDesireReadout({ data }: { data: DesireReadoutData }) {
  const t = useTranslations("nav.devolution");
  const forecast = forecastIndependenceDesire({
    previous: data.previous,
    policy: data.policy,
    westminsterPolicy: data.westminsterPolicy,
    ...data.inputs,
  });
  const keys = readoutKeys(data.stateId);
  const rows = [
    [t(keys.regionalPolicy), data.drivers.policy],
    [t(keys.nationalPolicy), data.drivers.westminsterPolicy],
    [
      t("regionalApproval", { value: data.inputs.regionalApproval.toFixed(1) }),
      data.drivers.regionalApproval,
    ],
    [
      t(keys.nationalApproval, { value: data.inputs.nationalApproval.toFixed(1) }),
      data.drivers.nationalApproval,
    ],
    [t(keys.inflation, { value: data.inputs.inflationPercent.toFixed(1) }), data.drivers.inflation],
    [t("recovery", { value: MEAN_REVERSION_TARGET }), data.drivers.meanReversion],
  ] as const;
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-card-border bg-card p-6">
        <h2 className="text-sm text-muted">{t(keys.desire)}</h2>
        <div className="mt-2 text-5xl font-bold tabular-nums">{data.previous.toFixed(2)}</div>
        <p className="mt-2 text-sm tabular-nums text-muted">
          {t("lastTurn", { value: formatDesireDrift(data.trend) })}
        </p>
        <p className="mt-1 text-xs text-muted">{t("scale")}</p>
        <p className="mt-3 text-sm tabular-nums">
          {t("annualForecast", { value: formatDesireDrift(forecast.annualChange) })}
        </p>
        <p className="mt-1 text-sm tabular-nums">
          {forecast.turnsToThreshold === 0
            ? t("thresholdMet", { threshold: forecast.threshold })
            : forecast.turnsToThreshold != null
              ? t("thresholdForecast", {
                  threshold: forecast.threshold,
                  turns: forecast.turnsToThreshold,
                  years: (forecast.turnsToThreshold / TURNS_PER_YEAR).toFixed(1),
                })
              : t("thresholdNotReached", { threshold: forecast.threshold })}
        </p>
        <p className="mt-1 text-xs text-muted">{t("forecastHelp")}</p>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-card-border" aria-hidden>
          <div
            className="h-full bg-primary"
            style={{ width: `${Math.max(0, Math.min(100, data.previous))}%` }}
          />
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            [keys.nationalStance, data.westminsterPolicy],
            [keys.regionalStance, data.policy],
          ] as const
        ).map(([label, policy]) => (
          <section key={label} className="rounded-xl border border-card-border bg-card p-4">
            <h3 className="text-xs text-muted">{t(label)}</h3>
            <p className="mt-1 font-semibold">{t(stanceMessageKey(data.stateId, policy))}</p>
          </section>
        ))}
      </div>
      <section className="rounded-xl border border-card-border bg-card p-6">
        <h2 className="text-sm text-muted">{t("drivers")}</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {rows.map(([label, value]) => (
            <li key={label} className="flex justify-between gap-4">
              <span>{label}</span>
              <span
                className={`tabular-nums ${value > 0 ? "text-emerald-500" : value < 0 ? "text-rose-500" : "text-muted"}`}
              >
                {formatDesireDrift(value)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between gap-4 border-t border-card-border pt-3 text-sm font-medium">
          <span>{t("net")}</span>
          <span className="tabular-nums">{formatDesireDrift(data.delta)}</span>
        </div>
        <p className="mt-3 text-xs text-muted">{t(keys.policyHelp)}</p>
      </section>
    </div>
  );
}
