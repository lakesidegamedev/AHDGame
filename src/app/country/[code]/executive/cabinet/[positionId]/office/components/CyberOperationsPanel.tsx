"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchJson } from "@/lib/observability/fetchJson";
import { getCountryDisplayName } from "@/lib/constants/countryClientConfig";
import { apiErrorText } from "@/lib/errors/catalog";
import { fmtMoneyAbs } from "./energy/energyUi";

type Refusal = "self" | "truce" | "crisis_active" | "cooldown" | "no_resilience_data";

interface TargetView {
  countryId: string;
  refusal: Refusal | null;
  /** Set when the service has nothing to stand down against this target. */
  standDownRefusal?: "self" | "truce" | "no_operation" | null;
  odds: {
    successChance: number;
    attributionIfSuccess: number;
    attributionIfFailed: number;
  } | null;
}

export interface CyberView {
  turn: number;
  cost: number;
  balance: number;
  hasDirector: boolean;
  targets: TargetView[];
  truces: Array<{ countryId: string; untilTurn: number; byYou: boolean }>;
  operations: Array<{
    direction: "by_you" | "against_you";
    countryId: string | null;
    succeeded: boolean;
    attributed: boolean;
    turn: number;
  }>;
}

const pct = (chance: number) => Math.round(chance * 100);

/** Cyber operations console. Mounted only for a player who can direct the service. */
export function CyberOperationsPanel({
  countryId,
  positionId,
  currencySymbol = "$",
}: {
  countryId: string;
  positionId: string;
  currencySymbol?: string;
}) {
  const t = useTranslations("worldOrganizations.cyber");
  const [view, setView] = useState<CyberView | null>(null);
  const [failed, setFailed] = useState(false);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const url = `/api/country/${countryId}/executive/cabinet/${positionId}/intelligence/cyber`;
  const load = useCallback(() => {
    fetchJson<CyberView>(url, { feature: "country-intelligence-cyber" })
      .then(setView)
      .catch(() => setFailed(true));
  }, [url]);
  useEffect(load, [load]);

  if (failed) return <p className="text-sm text-muted">{t("unavailable")}</p>;
  if (!view) return <p className="text-sm text-muted">{t("loading")}</p>;

  const selected = view.targets.find((row) => row.countryId === target) ?? null;
  const canAfford = view.balance >= view.cost;
  const launchBlocked = !view.hasDirector || !selected || selected.refusal !== null || !canAfford;

  const submit = async (action: "launch" | "stand_down") => {
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCountryId: target, action }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        truceUntilTurn?: number;
      };
      if (!res.ok) {
        setProblem(apiErrorText(payload, t("problem")));
        return;
      }
      setNotice(
        action === "launch"
          ? t("outcome", { message: payload.message ?? "" })
          : t("standDownDone", { turn: payload.truceUntilTurn ?? 0 })
      );
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-card-border bg-card p-4 shadow-card">
      <h2 className="text-lg text-foreground">{t("title")}</h2>
      <p className="mt-0.5 max-w-2xl text-sm text-muted">{t("intro")}</p>

      {problem && (
        <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-foreground">
          {problem}
        </p>
      )}
      {notice && (
        <p className="mt-3 rounded-lg border border-card-border bg-background p-3 text-sm text-foreground">
          {notice}
        </p>
      )}
      {!view.hasDirector && (
        <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
          {t("noDirector")}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-muted">
          {t("target")}
          <select
            className="mt-1 rounded border border-card-border bg-background p-2 text-sm text-foreground"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">{t("chooseTarget")}</option>
            {view.targets.map((row) => (
              <option key={row.countryId} value={row.countryId}>
                {getCountryDisplayName(row.countryId as never)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy || launchBlocked}
          onClick={() => submit("launch")}
          className="rounded bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? t("working") : t("launch")}
        </button>
        <button
          type="button"
          disabled={busy || !target || !!selected?.standDownRefusal}
          onClick={() => submit("stand_down")}
          className="rounded border border-card-border px-3 py-2 text-sm text-foreground disabled:opacity-50"
        >
          {t("standDown")}
        </button>
      </div>

      {selected && (
        <div className="mt-3 space-y-1 text-sm text-muted">
          {selected.refusal && <p>{t(`refusal.${selected.refusal}`)}</p>}
          {selected.odds && (
            <>
              <p>{t("successChance", { percent: pct(selected.odds.successChance) })}</p>
              <p>{t("attributionSuccess", { percent: pct(selected.odds.attributionIfSuccess) })}</p>
              <p>{t("attributionFailed", { percent: pct(selected.odds.attributionIfFailed) })}</p>
            </>
          )}
          <p>
            {t("cost", {
              amount: fmtMoneyAbs(currencySymbol, view.cost),
              balance: fmtMoneyAbs(currencySymbol, view.balance),
            })}
          </p>
          {!canAfford && <p>{t("cannotAfford")}</p>}
          <p>{t("standDownHelp")}</p>
        </div>
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-muted">{t("trucesTitle")}</h3>
          {view.truces.length === 0 ? (
            <p className="mt-1 text-sm text-muted">{t("noTruces")}</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm text-foreground">
              {view.truces.map((truce) => (
                <li key={truce.countryId}>
                  {t("truce", {
                    country: getCountryDisplayName(truce.countryId as never),
                    turn: truce.untilTurn,
                    who: truce.byYou ? "you" : "other",
                  })}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-muted">{t("operationsTitle")}</h3>
          {view.operations.length === 0 ? (
            <p className="mt-1 text-sm text-muted">{t("noOperations")}</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm text-foreground">
              {view.operations.map((op, index) => {
                const name = op.countryId ? getCountryDisplayName(op.countryId as never) : "";
                const result = op.succeeded ? "success" : "failed";
                return (
                  <li key={`${op.turn}-${index}`}>
                    {op.direction === "by_you"
                      ? t("byYou", {
                          turn: op.turn,
                          country: name,
                          result,
                          attributed: op.attributed ? "yes" : "no",
                        })
                      : t("againstYou", {
                          turn: op.turn,
                          result,
                          country: op.countryId ? "known" : "unknown",
                          name,
                        })}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
