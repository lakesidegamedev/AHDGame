"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LocalTime } from "@/components/time/LocalTime";
import { diffLines, diffStats } from "@/lib/wiki/rules/lineDiff";

interface RevisionRow {
  id: string;
  kind: "baseline" | "approved" | "restored" | "moderator_edit";
  title: string;
  authorName: string | null;
  moderatorName: string | null;
  note: string | null;
  createdAt: string;
}

interface RevisionBody {
  id: string;
  title: string;
  description: string;
  content: string;
}

const KIND_LABEL: Record<RevisionRow["kind"], string> = {
  baseline: "Earlier version",
  approved: "Approved",
  restored: "Restored",
  moderator_edit: "Moderator edit",
};

async function fetchBody(slug: string, id: string): Promise<RevisionBody | null> {
  const res = await fetch(`/api/wiki/${slug}/history/${id}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.revision as RevisionBody;
}

export function WikiHistoryClient({ slug }: { slug: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<RevisionRow[] | null>(null);
  const [canRestore, setCanRestore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [bodies, setBodies] = useState<{ from: RevisionBody; to: RevisionBody } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/wiki/${slug}/history`);
    if (!res.ok) {
      setError("The history could not be loaded.");
      return;
    }
    const json = await res.json();
    const list = json.revisions as RevisionRow[];
    setRows(list);
    setCanRestore(json.canRestore === true);
    setToId(list[0]?.id ?? null);
    setFromId(list[1]?.id ?? null);
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!fromId || !toId) {
      setBodies(null);
      return;
    }
    let cancelled = false;
    Promise.all([fetchBody(slug, fromId), fetchBody(slug, toId)]).then(([from, to]) => {
      if (cancelled) return;
      if (from && to) setBodies({ from, to });
      else setError("One of the versions could not be loaded.");
    });
    return () => {
      cancelled = true;
    };
  }, [slug, fromId, toId]);

  const diff = useMemo(() => {
    if (!bodies) return null;
    const lines = diffLines(bodies.from.content, bodies.to.content);
    return { lines, stats: diffStats(lines) };
  }, [bodies]);

  const restore = async (id: string) => {
    if (!window.confirm("Put this version back on the live page?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/wiki/${slug}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId: id }),
      });
      if (!res.ok) throw new Error();
      await load();
      router.refresh();
    } catch {
      setError("The version could not be restored. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  if (error && !rows) return <p className="text-body text-muted">{error}</p>;
  if (!rows) return <p className="text-body text-muted">Loading history...</p>;
  if (rows.length === 0) {
    return (
      <p className="text-body text-muted">
        No versions are stored yet. The first approved change will start the history.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <p
          role="alert"
          className="rounded-md border border-card-border bg-card p-3 text-body text-red-500"
        >
          {error}
        </p>
      )}

      <ul className="divide-y divide-card-border rounded-lg border border-card-border bg-card">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-body">
            <label className="flex items-center gap-1 text-muted">
              <input
                type="radio"
                name="from"
                checked={fromId === row.id}
                onChange={() => setFromId(row.id)}
                aria-label={`Compare from ${KIND_LABEL[row.kind]} on ${row.createdAt}`}
              />
              From
            </label>
            <label className="flex items-center gap-1 text-muted">
              <input
                type="radio"
                name="to"
                checked={toId === row.id}
                onChange={() => setToId(row.id)}
                aria-label={`Compare to ${KIND_LABEL[row.kind]} on ${row.createdAt}`}
              />
              To
            </label>
            <span className="font-medium text-foreground">{KIND_LABEL[row.kind]}</span>
            <LocalTime
              value={row.createdAt}
              options={{ dateStyle: "medium", timeStyle: "short" }}
            />
            <span className="text-muted">
              {row.moderatorName
                ? `by ${row.moderatorName}`
                : row.authorName
                  ? `by ${row.authorName}`
                  : ""}
            </span>
            {row.note && <span className="text-muted">{row.note}</span>}
            {canRestore && (
              <button
                type="button"
                disabled={busy}
                onClick={() => restore(row.id)}
                className="ml-auto rounded-md border border-card-border px-3 py-1 text-foreground hover:bg-muted disabled:opacity-50"
              >
                Restore this version
              </button>
            )}
          </li>
        ))}
      </ul>

      {diff && bodies && (
        <section aria-label="Changes between the chosen versions">
          <h2 className="mb-2 text-heading font-semibold text-foreground">
            Changes ({diff.stats.added} added, {diff.stats.removed} removed)
          </h2>
          {bodies.from.title !== bodies.to.title && (
            <p className="mb-2 text-body text-muted">
              Title: {bodies.from.title} to {bodies.to.title}
            </p>
          )}
          <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap rounded-lg border border-card-border bg-card p-3 font-mono text-body-sm">
            {diff.lines.map((line, i) => (
              <div
                key={i}
                className={
                  line.op === "add"
                    ? "bg-green-500/15 text-green-300"
                    : line.op === "remove"
                      ? "bg-red-500/15 text-red-300"
                      : "text-muted"
                }
              >
                {line.op === "add" ? "+ " : line.op === "remove" ? "- " : "  "}
                {line.text}
              </div>
            ))}
          </pre>
        </section>
      )}
    </div>
  );
}
