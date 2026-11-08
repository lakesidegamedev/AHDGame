"use client";

import { useEffect, useMemo, useState } from "react";
import { SVG_W, SVG_H, WORLD_GEO_URL } from "@/app/world/worldConstants";
import { isoNumericToCountryId } from "@/lib/constants/countryIso";
import type { BoardCrisis } from "@/lib/crises/queries/crisisBoard";
import type { SpreadLink } from "@/lib/crises/rules/boardView";
import { KIND_COLOR, KIND_LABEL, SEVERITY_RADIUS } from "./crisisBoardStyle";

export interface Hotspot {
  id: string;
  x: number;
  y: number;
}

/**
 * Anchor crises at their primary country. Crises sharing a country fan out on
 * a ring so none hides another.
 */
export function layoutHotspots(
  crises: Pick<BoardCrisis, "id" | "countryIds">[],
  centroids: Map<string, [number, number]>
): Hotspot[] {
  const byCountry = new Map<string, string[]>();
  for (const c of crises) {
    const country = c.countryIds.find((id) => centroids.has(id));
    if (!country) continue;
    byCountry.set(country, [...(byCountry.get(country) ?? []), c.id]);
  }
  const spots: Hotspot[] = [];
  for (const [country, ids] of byCountry) {
    const [cx, cy] = centroids.get(country)!;
    ids.forEach((id, i) => {
      if (ids.length === 1) return spots.push({ id, x: cx, y: cy });
      const angle = (2 * Math.PI * i) / ids.length - Math.PI / 2;
      spots.push({ id, x: cx + 13 * Math.cos(angle), y: cy + 13 * Math.sin(angle) });
    });
  }
  return spots;
}

export function CrisisBoardMap({
  crises,
  links,
  selectedId,
  onSelect,
}: {
  crises: BoardCrisis[];
  links: SpreadLink[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [paths, setPaths] = useState<Array<{ key: string; d: string }>>([]);
  const [centroids, setCentroids] = useState<Map<string, [number, number]>>(new Map());
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d3, topojson] = await Promise.all([import("d3-geo"), import("topojson-client")]);
        const resp = await fetch(WORLD_GEO_URL);
        if (!resp.ok) throw new Error(`geo ${resp.status}`);
        const topo = await resp.json();
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const geojson = (topojson as any).feature(topo, topo.objects.countries);
        const proj = d3.geoEqualEarth().fitSize([SVG_W, SVG_H], { type: "Sphere" });
        const gen = d3.geoPath(proj);
        const nextPaths: Array<{ key: string; d: string }> = [];
        const nextCentroids = new Map<string, [number, number]>();
        for (const f of geojson.features) {
          const d = gen(f);
          if (!d) continue;
          nextPaths.push({ key: String(f.id ?? f.properties?.name), d });
          const countryId = isoNumericToCountryId(String(f.id));
          if (!countryId) continue;
          const [x, y] = gen.centroid(f);
          if (Number.isFinite(x) && Number.isFinite(y)) nextCentroids.set(countryId, [x, y]);
        }
        setPaths(nextPaths);
        setCentroids(nextCentroids);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const spots = useMemo(() => layoutHotspots(crises, centroids), [crises, centroids]);
  const spotById = useMemo(() => new Map(spots.map((s) => [s.id, s])), [spots]);
  const crisisById = useMemo(() => new Map(crises.map((c) => [c.id, c])), [crises]);
  const unplaced = crises.filter((c) => !spotById.has(c.id));

  return (
    <div className="rounded-xl border border-card-border bg-card overflow-hidden">
      {failed ? (
        <p className="p-6 text-sm text-muted">
          The map could not be loaded. The list below is complete.
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="block w-full bg-card-elevated"
          role="img"
          aria-label="World map of active crises"
        >
          {paths.map((p) => (
            <path
              key={p.key}
              d={p.d}
              fill="var(--card)"
              stroke="var(--card-border)"
              strokeWidth={0.5}
            />
          ))}
          {links.map((l) => {
            const a = spotById.get(l.fromId);
            const b = spotById.get(l.toId);
            if (!a || !b) return null;
            const mx = (a.x + b.x) / 2;
            const my = Math.min(a.y, b.y) - Math.hypot(a.x - b.x, a.y - b.y) * 0.18;
            return (
              <path
                key={`${l.via}-${l.fromId}-${l.toId}`}
                d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`}
                fill="none"
                stroke={l.via === "campaign" ? KIND_COLOR.war : "currentColor"}
                strokeOpacity={0.55}
                strokeWidth={1.2}
                strokeDasharray={
                  l.via === "chain" ? "4 3" : l.via === "spillover" ? "1 4" : undefined
                }
                className="text-muted"
              />
            );
          })}
          {spots.map((s) => {
            const c = crisisById.get(s.id);
            if (!c) return null;
            const r = SEVERITY_RADIUS[c.severity];
            const selected = s.id === selectedId;
            return (
              <g
                key={s.id}
                transform={`translate(${s.x},${s.y})`}
                onClick={() => onSelect(s.id)}
                style={{ cursor: "pointer" }}
                role="button"
                aria-label={`${c.name}, ${KIND_LABEL[c.kind]}`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onSelect(s.id);
                }}
              >
                <circle r={Math.max(r, 12)} fill="transparent" />
                {c.viewerCanAct && (
                  <circle r={r + 4} fill="none" stroke={KIND_COLOR[c.kind]} strokeWidth={1.5} />
                )}
                <circle
                  r={r}
                  fill={KIND_COLOR[c.kind]}
                  fillOpacity={0.8}
                  stroke={selected ? "var(--foreground)" : "var(--card)"}
                  strokeWidth={selected ? 2 : 1}
                />
              </g>
            );
          })}
        </svg>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-card-border px-3 py-2 text-xs text-muted">
        {(Object.keys(KIND_COLOR) as Array<keyof typeof KIND_COLOR>).map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: KIND_COLOR[k] }} />
            {KIND_LABEL[k]}
          </span>
        ))}
        <span>Size = severity</span>
        <span>Ring = you can act</span>
        <span>Line = linked crisis</span>
        {unplaced.length > 0 && (
          <span className="ml-auto">{unplaced.length} worldwide or unplaced, see list</span>
        )}
      </div>
    </div>
  );
}
