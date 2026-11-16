"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useIsWikiWriter } from "@/components/wiki/WikiViewerContext";

type Loaded<T> = { state: "loading" } | { state: "missing" } | { state: "ready"; data: T };

function useEmbedData<T>(url: string, accept: (json: unknown) => T | null): Loaded<T> {
  const [result, setResult] = useState<Loaded<T>>({ state: "loading" });
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled) return;
        const data = json ? accept(json) : null;
        setResult(data ? { state: "ready", data } : { state: "missing" });
      })
      .catch(() => !cancelled && setResult({ state: "missing" }));
    return () => {
      cancelled = true;
    };
  }, [url, accept]);
  return result;
}

/** Readers see nothing for a bad id; the writer gets a quiet line to fix it. */
function MissingEmbed({ what, id }: { what: string; id: string }) {
  const isWriter = useIsWikiWriter();
  if (!isWriter) return null;
  return (
    <p className="my-3 text-xs italic text-muted">
      {what} {id ? `"${id}" ` : ""}not found. Only you can see this line.
    </p>
  );
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <figure className="my-4 rounded-lg border border-card-border bg-card/60 p-4">
      <figcaption className="mb-3 text-sm font-semibold text-foreground">{title}</figcaption>
      {children}
    </figure>
  );
}

const Skeleton = () => (
  <div className="my-4 h-24 animate-pulse rounded-lg border border-card-border bg-card" />
);

interface ElectionData {
  label: string;
  finalized: boolean;
  rows: { name: string; party: string; votes: number; pct: number }[];
}

function acceptElection(json: unknown): ElectionData | null {
  const e = json as {
    label?: string;
    generalResults?: {
      totalVotes?: Record<string, number>;
      candidateNames?: Record<string, string>;
      candidateParties?: Record<string, string>;
      finalized?: boolean;
    } | null;
  };
  const g = e.generalResults;
  if (!e.label || !g?.totalVotes) return null;
  const entries = Object.entries(g.totalVotes);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  const rows = entries
    .map(([id, votes]) => ({
      name: g.candidateNames?.[id] ?? id,
      party: g.candidateParties?.[id] ?? "",
      votes,
      pct: total > 0 ? (votes / total) * 100 : 0,
    }))
    .sort((a, b) => b.votes - a.votes)
    .slice(0, 8);
  return rows.length ? { label: e.label, finalized: g.finalized === true, rows } : null;
}

export function WikiElectionEmbed({ data }: { data?: string }) {
  const id = (data ?? "").trim();
  const result = useEmbedData(`/api/wiki/elections/${encodeURIComponent(id)}`, acceptElection);
  if (result.state === "loading") return <Skeleton />;
  if (result.state === "missing") return <MissingEmbed what="Election" id={id} />;
  const { label, finalized, rows } = result.data;
  return (
    <Frame title={`${label}${finalized ? "" : " (counting)"}`}>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.name} className="text-sm">
            <div className="flex justify-between gap-2 text-foreground">
              <span>
                {row.name}
                {row.party ? <span className="text-muted"> ({row.party})</span> : null}
              </span>
              <span className="tabular-nums">{row.pct.toFixed(1)}%</span>
            </div>
            <div className="mt-1 h-2 rounded bg-card-elevated">
              <div className="h-2 rounded bg-primary" style={{ width: `${row.pct}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

interface SeatsData {
  name: string;
  color: string;
  seats: { label: string; count: number }[];
}

function acceptSeats(json: unknown): SeatsData | null {
  const j = json as Partial<SeatsData> & { found?: boolean };
  return j.found && j.name && Array.isArray(j.seats)
    ? { name: j.name, color: j.color ?? "#888888", seats: j.seats }
    : null;
}

export function WikiPartySeatsEmbed({ data }: { data?: string }) {
  const id = (data ?? "").trim();
  const result = useEmbedData(`/api/wiki/embed/party-seats/${encodeURIComponent(id)}`, acceptSeats);
  if (result.state === "loading") return <Skeleton />;
  if (result.state === "missing") return <MissingEmbed what="Party" id={id} />;
  const { name, color, seats } = result.data;
  const max = Math.max(1, ...seats.map((s) => s.count));
  return (
    <Frame title={`${name}: seats held`}>
      <ul className="space-y-2">
        {seats.map((s) => (
          <li key={s.label} className="grid grid-cols-[6rem_1fr_3rem] items-center gap-2 text-sm">
            <span className="text-muted">{s.label}</span>
            <div className="h-3 rounded bg-card-elevated">
              <div
                className="h-3 rounded"
                style={{ width: `${(s.count / max) * 100}%`, backgroundColor: color }}
              />
            </div>
            <span className="text-right tabular-nums text-foreground">{s.count}</span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

interface StockData {
  name: string;
  ticker: string | null;
  points: { turn: number; sharePrice: number }[];
}

function acceptStock(json: unknown): StockData | null {
  const j = json as Partial<StockData> & { found?: boolean };
  return j.found && j.name && Array.isArray(j.points) && j.points.length > 1
    ? { name: j.name, ticker: j.ticker ?? null, points: j.points }
    : null;
}

export function WikiStockEmbed({ data }: { data?: string }) {
  const id = (data ?? "").trim();
  const result = useEmbedData(`/api/wiki/embed/stock/${encodeURIComponent(id)}`, acceptStock);
  if (result.state === "loading") return <Skeleton />;
  if (result.state === "missing") return <MissingEmbed what="Corporation" id={id} />;
  const { name, ticker, points } = result.data;
  const prices = points.map((p) => p.sharePrice);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const span = hi - lo || 1;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 300;
      const y = 70 - ((p.sharePrice - lo) / span) * 60;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = prices[prices.length - 1] ?? 0;
  return (
    <Frame title={`${name}${ticker ? ` (${ticker})` : ""}: share price`}>
      <svg
        viewBox="0 0 300 80"
        role="img"
        aria-label={`Share price from ${lo.toFixed(2)} to ${hi.toFixed(2)}`}
        className="h-24 w-full"
      >
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" className="text-primary" />
      </svg>
      <p className="mt-2 text-xs text-muted">
        Latest {last.toFixed(2)}. Low {lo.toFixed(2)}, high {hi.toFixed(2)} over the last{" "}
        {points.length} turns.
      </p>
    </Frame>
  );
}
