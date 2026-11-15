"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LocalTime } from "@/components/time/LocalTime";

interface ReportRow {
  id: string;
  slug: string;
  reason: string;
  note: string;
  quote: string;
  resolved: boolean;
  createdAt: string;
}

const REASON_LABELS: Record<string, string> = {
  stale: "Stale",
  incorrect: "Incorrect",
  "update-request": "Update request",
  other: "Other",
};

export function WikiReportsPanel() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/wiki/reports");
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as { reports: ReportRow[] };
      setReports(data.reports);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(report: ReportRow) {
    const resolved = !report.resolved;
    setReports((rows) => rows.map((r) => (r.id === report.id ? { ...r, resolved } : r)));
    const res = await fetch("/api/admin/wiki/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: report.id, resolved }),
    }).catch(() => null);
    if (!res?.ok) void load();
  }

  const groups = useMemo(() => {
    const bySlug = new Map<string, ReportRow[]>();
    for (const r of reports) {
      if (r.resolved && !showResolved) continue;
      const list = bySlug.get(r.slug) ?? [];
      list.push(r);
      bySlug.set(r.slug, list);
    }
    return [...bySlug.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [reports, showResolved]);

  const openCount = reports.filter((r) => !r.resolved).length;

  return (
    <section className="space-y-4" aria-label="Wiki reports">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Wiki reports ({openCount} open)</h2>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          Show resolved
        </label>
      </div>

      {loading && <p className="text-muted">Loading reports...</p>}
      {failed && <p className="text-sm text-error">Could not load reports.</p>}
      {!loading && !failed && groups.length === 0 && (
        <p className="text-sm text-muted">No reports to show.</p>
      )}

      {groups.map(([slug, rows]) => (
        <div key={slug} className="rounded-lg border border-card-border bg-card">
          <div className="flex items-center justify-between border-b border-card-border px-4 py-2">
            <a href={`/wiki/${slug}`} className="font-medium text-primary hover:underline">
              {slug}
            </a>
            <span className="text-xs text-muted">{rows.length} report(s)</span>
          </div>
          <ul className="divide-y divide-card-border">
            {rows.map((r) => (
              <li key={r.id} className="space-y-1 px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted">
                    {REASON_LABELS[r.reason] ?? r.reason} •{" "}
                    <LocalTime value={r.createdAt} options={{ dateStyle: "medium" }} />
                  </span>
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <input type="checkbox" checked={r.resolved} onChange={() => toggle(r)} />
                    Resolved
                  </label>
                </div>
                {r.quote && (
                  <blockquote className="border-l-2 border-card-border pl-3 text-foreground">
                    {r.quote}
                  </blockquote>
                )}
                {r.note && <p className="text-muted">{r.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
