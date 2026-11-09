"use client";

import { useCallback, useEffect, useState } from "react";
import { apiErrorText } from "@/lib/errors/catalog";
import type { FrontierRaceView } from "@/lib/frontierRaces/service";
import type { FundingOptions } from "@/lib/frontierRaces/access";
import {
  CORPORATION_RD_PER_POINT,
  COUNTRY_CASH_PER_POINT,
  LICENCE_STRENGTH,
  SUNSET_TURNS,
} from "@/lib/frontierRaces/rules";

interface Payload {
  races: FrontierRaceView[];
  options: FundingOptions | null;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function RaceCard({
  race,
  options,
  onFunded,
}: {
  race: FrontierRaceView;
  options: FundingOptions | null;
  onFunded: () => void;
}) {
  const [points, setPoints] = useState(50);
  const [corporationId, setCorporationId] = useState(options?.corporations[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fund = async (kind: "country" | "corporation") => {
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/frontier-races/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raceId: race.id,
          kind,
          points,
          ...(kind === "corporation" ? { corporationId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(apiErrorText(data, "Could not fund this programme"));
        return;
      }
      setMessage(`Funded ${data.points} points. Your total is ${data.total}.`);
      onFunded();
    } catch {
      setMessage("Could not reach the server");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-label={race.label}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{race.label}</h2>
        <span className="text-sm text-muted-foreground">
          {race.status === "pending" && `Opens ${race.opensYear}`}
          {race.status === "open" && "Open"}
          {race.status === "won" && "Won"}
        </span>
      </header>
      <p className="mt-1 text-sm text-muted-foreground">
        Prize: {race.method}. {race.threshold.toLocaleString()} points to win.
      </p>

      {race.winner && (
        <p className="mt-2 text-sm font-medium text-success">
          {race.winner.name} finished first and holds the method. Rivals with a real stake get a
          weaker licence {SUNSET_TURNS} turns later, at {pct(LICENCE_STRENGTH)} strength.
        </p>
      )}

      {race.leaderboard.length > 0 ? (
        <ol className="mt-3 space-y-1.5">
          {race.leaderboard.map((row) => (
            <li key={`${row.kind}:${row.id}`} className="text-sm">
              <div className="flex justify-between gap-2">
                <span>
                  {row.rank}. {row.name}{" "}
                  <span className="text-xs text-muted-foreground">
                    {row.kind === "country" ? "nation" : "corporation"}
                  </span>
                </span>
                <span className="tabular-nums">
                  {row.points.toLocaleString()} ({pct(row.progress)})
                </span>
              </div>
              <div className="mt-0.5 h-1.5 rounded bg-muted">
                <div
                  className="h-1.5 rounded bg-primary"
                  style={{ width: `${Math.round(row.progress * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Nobody has funded this yet.</p>
      )}

      {race.status === "open" &&
        options &&
        (options.country || options.corporations.length > 0) && (
          <div className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
            <label className="flex items-center gap-2">
              Points
              <input
                type="number"
                min={1}
                max={1000}
                value={points}
                onChange={(e) =>
                  setPoints(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))
                }
                className="w-24 rounded border border-border bg-background px-2 py-1"
              />
            </label>
            {options.country && (
              <button
                type="button"
                disabled={pending}
                onClick={() => fund("country")}
                className="rounded bg-primary px-3 py-1.5 text-primary-foreground disabled:opacity-50"
              >
                Fund for {options.country.name} (treasury cost{" "}
                {(points * COUNTRY_CASH_PER_POINT).toLocaleString()})
              </button>
            )}
            {options.corporations.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={corporationId}
                  onChange={(e) => setCorporationId(e.target.value)}
                  className="rounded border border-border bg-background px-2 py-1"
                >
                  {options.corporations.map((corp) => (
                    <option key={corp.id} value={corp.id}>
                      {corp.name} ({Math.floor(corp.rdScore).toLocaleString()} R&amp;D)
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pending || !corporationId}
                  onClick={() => fund("corporation")}
                  className="rounded bg-primary px-3 py-1.5 text-primary-foreground disabled:opacity-50"
                >
                  Fund from R&amp;D ({(points * CORPORATION_RD_PER_POINT).toLocaleString()} points)
                </button>
              </div>
            )}
            {message && <p role="status">{message}</p>}
          </div>
        )}
    </section>
  );
}

export function FrontierRacesClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/frontier-races", { cache: "no-store" });
      if (!res.ok) throw new Error("bad status");
      setData((await res.json()) as Payload);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">Frontier programme races</h1>
      <p className="text-sm text-muted-foreground">
        Nations fund programmes from the treasury and corporations from research points. The first
        to reach a programme&apos;s threshold takes the method and the national credit. Rivals that
        funded at least a quarter of the threshold lose some approval at home, then receive a weaker
        licence once the sunset period ends.
      </p>
      {failed && <p className="text-sm text-destructive">Could not load the races.</p>}
      {!data && !failed && <p className="text-sm text-muted-foreground">Loading.</p>}
      {data?.races.map((race) => (
        <RaceCard key={race.id} race={race} options={data.options} onFunded={load} />
      ))}
    </main>
  );
}
