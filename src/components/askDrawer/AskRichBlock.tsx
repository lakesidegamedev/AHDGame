"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// The blocks Ask answers carry beyond prose, drawn the way the Ask Keir site
// draws them. Charts and maps are laid out by Ask's own renderer (through the
// game's /api/ask-drawer proxy), so they match the site exactly; the chart SVG
// follows the game's light and dark theme through :root[data-theme].

interface ChartTable {
  head: string[];
  rows: string[][];
}

/** Ask's chart dialects: its own `ask-chart` spec, and bar/line/pie Mermaid. */
export function isChartMermaid(code: string): boolean {
  for (const raw of code.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("%%")) continue;
    return /^(?:xychart(?:-beta)?|pie)\b/i.test(line);
  }
  return false;
}

export type RichKind = "chart" | "map" | "diagram" | null;

export function richKind(lang: string, code: string): RichKind {
  if (lang === "ask-chart") return "chart";
  if (lang === "mermaid" || lang === "mmd") return isChartMermaid(code) ? "chart" : "diagram";
  if (lang === "ahd-map") return "map";
  return null;
}

function Skeleton({ label }: { label: string }) {
  return (
    <div
      className="my-3 flex h-40 items-center justify-center rounded-xl border border-card-border/70 bg-card-elevated/40 text-[12px] text-muted"
      role="status"
    >
      <span className="animate-pulse">{label}</span>
    </div>
  );
}

function Failed({ what, fullAskUrl }: { what: string; fullAskUrl: string }) {
  return (
    <div className="my-3 rounded-xl border border-card-border/70 bg-card-elevated/40 px-3 py-2 text-[13px] text-muted">
      This {what} could not be drawn here.{" "}
      <a
        href={fullAskUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline"
      >
        Open it in Ask Keir
      </a>
    </div>
  );
}

function Tooltip({ tip }: { tip: { lines: string[]; x: number; y: number } | null }) {
  if (!tip) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed z-[70] flex max-w-[260px] flex-col gap-px rounded-lg border border-card-border bg-card px-2.5 py-1.5 text-[12px] text-foreground shadow-modal"
      style={{ left: tip.x, top: tip.y }}
    >
      <b className="font-semibold">{tip.lines[0]}</b>
      {tip.lines.slice(1).map((l, i) => (
        <span key={i} className="text-muted">
          {l}
        </span>
      ))}
    </div>
  );
}

export function AskChart({
  source,
  format,
  question,
  fullAskUrl,
}: {
  source: string;
  format: "ask-chart" | "mermaid";
  question: string;
  fullAskUrl: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [result, setResult] = useState<{ svg: string; table: ChartTable | null } | "failed" | null>(
    null
  );
  const [showData, setShowData] = useState(false);
  const [tip, setTip] = useState<{ lines: string[]; x: number; y: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const width = Math.max(280, Math.min(980, Math.round(ref.current?.clientWidth || 360)));
    fetch("/api/ask-drawer/chart/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      signal: controller.signal,
      body: JSON.stringify({
        width,
        game: "ahd",
        question,
        ...(format === "mermaid" ? { mermaid: source } : { source }),
      }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((x: { svg?: string; table?: ChartTable }) => {
        if (!x?.svg) throw new Error("render");
        setResult({ svg: x.svg, table: x.table ?? null });
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setResult("failed");
      });
    return () => controller.abort();
  }, [source, format, question]);

  const onPointer = (e: React.PointerEvent) => {
    const node = (e.target as Element).closest?.("[data-tip]");
    if (!node) {
      setTip(null);
      return;
    }
    const lines = String(node.getAttribute("data-tip") || "").split("\n");
    setTip({
      lines,
      x: Math.min(window.innerWidth - 270, e.clientX + 14),
      y: Math.max(8, e.clientY - 60),
    });
  };

  return (
    <figure ref={ref} className="my-3">
      {result === null && <Skeleton label="Drawing chart…" />}
      {result === "failed" && <Failed what="chart" fullAskUrl={fullAskUrl} />}
      {result && result !== "failed" && (
        <>
          <div
            className="overflow-hidden rounded-xl shadow-sm [&_svg]:block [&_svg]:h-auto [&_svg]:w-full [&_svg]:max-w-full"
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={() => setTip(null)}
            // Ask's renderer builds this SVG server-side from a validated spec
            // and escapes every label; the Ask Keir site inserts it the same way.
            dangerouslySetInnerHTML={{ __html: result.svg }}
          />
          <Tooltip tip={tip} />
          {result.table && (
            <figcaption className="mt-1.5">
              <button
                type="button"
                onClick={() => setShowData(!showData)}
                className="text-[12px] text-muted hover:text-foreground"
                aria-expanded={showData}
              >
                {showData ? "Hide data" : "Show data"}
              </button>
              {showData && (
                <div className="mt-1.5 overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr>
                        {result.table.head.map((h, i) => (
                          <th key={i} className="px-2 py-1 text-left font-semibold">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.table.rows.map((row, r) => (
                        <tr key={r}>
                          {row.map((c, i) => (
                            <td
                              key={i}
                              className={`border-t border-card-border/60 px-2 py-1 ${i ? "text-right tabular-nums" : ""}`}
                            >
                              {c}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </figcaption>
          )}
        </>
      )}
    </figure>
  );
}

function parseSpec(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

export function AskMap({ source, fullAskUrl }: { source: string; fullAskUrl: string }) {
  const spec = useMemo(() => parseSpec(source), [source]);
  const [url, setUrl] = useState<string | "failed" | null>(null);

  useEffect(() => {
    if (spec === null) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    fetch("/api/ask-drawer/map/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      signal: controller.signal,
      body: JSON.stringify(spec),
    })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => {
        // An <img> of the SVG: scripts and links inside it never run.
        objectUrl = URL.createObjectURL(new Blob([blob], { type: "image/svg+xml" }));
        setUrl(objectUrl);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setUrl("failed");
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [spec]);

  if (spec === null || url === "failed") return <Failed what="map" fullAskUrl={fullAskUrl} />;
  if (url === null) return <Skeleton label="Drawing map…" />;
  // eslint-disable-next-line @next/next/no-img-element -- a generated SVG blob, not an optimizable asset
  return <img src={url} alt="Map" className="my-3 w-full rounded-xl" />;
}

export function AskDiagram({ fullAskUrl }: { fullAskUrl: string }) {
  return (
    <div className="my-3 rounded-xl border border-card-border/70 bg-card-elevated/40 px-3 py-2 text-[13px] text-muted">
      This answer includes a diagram.{" "}
      <a
        href={fullAskUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline"
      >
        Open it in Ask Keir
      </a>{" "}
      to see it drawn.
    </div>
  );
}
