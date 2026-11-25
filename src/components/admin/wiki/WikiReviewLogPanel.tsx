"use client";

import { useCallback, useEffect, useState } from "react";
import { LocalTime } from "@/components/time/LocalTime";

interface LogEntry {
  id: string;
  slug: string;
  title: string;
  decision: "approved" | "rejected";
  moderatorName: string;
  authorName: string | null;
  note: string | null;
  createdAt: string;
}

interface ModeratorOption {
  id: string;
  name: string;
}

export function WikiReviewLogPanel() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [moderators, setModerators] = useState<ModeratorOption[]>([]);
  const [moderator, setModerator] = useState("");
  const [slug, setSlug] = useState("");
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (moderator) params.set("moderator", moderator);
    if (slug.trim()) params.set("slug", slug.trim().toLowerCase());
    try {
      const res = await fetch(`/api/admin/wiki/review-log?${params.toString()}`);
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as { entries: LogEntry[]; moderators: ModeratorOption[] };
      setEntries(data.entries);
      setModerators(data.moderators);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [moderator, slug]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="space-y-4" aria-label="Approval log">
      <h2 className="text-heading font-bold text-foreground">Approval log</h2>
      <div className="flex flex-wrap gap-3">
        <select
          value={moderator}
          onChange={(e) => setModerator(e.target.value)}
          aria-label="Filter by moderator"
          className="rounded-md border border-card-border bg-card px-3 py-2 text-body text-foreground"
        >
          <option value="">All moderators</option>
          {moderators.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="Page address, like player-12"
          aria-label="Filter by page address"
          className="w-64 rounded-md border border-card-border bg-card px-3 py-2 text-body text-foreground"
        />
      </div>

      {failed ? (
        <p className="text-body text-muted">The log could not be loaded.</p>
      ) : loading && entries.length === 0 ? (
        <p className="text-body text-muted">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="text-body text-muted">No decisions match.</p>
      ) : (
        <ul className="divide-y divide-card-border rounded-lg border border-card-border bg-card">
          {entries.map((e) => (
            <li key={e.id} className="px-4 py-3 text-body">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={
                    e.decision === "approved"
                      ? "font-medium text-green-400"
                      : "font-medium text-red-400"
                  }
                >
                  {e.decision === "approved" ? "Approved" : "Rejected"}
                </span>
                <a href={`/wiki/${e.slug}`} className="text-primary hover:underline">
                  {e.title}
                </a>
                <span className="text-muted">
                  by {e.moderatorName}
                  {e.authorName ? `, written by ${e.authorName}` : ""}
                </span>
                <LocalTime
                  value={e.createdAt}
                  options={{ dateStyle: "medium", timeStyle: "short" }}
                  className="text-muted"
                />
              </div>
              {e.note && <p className="mt-1 text-muted">{e.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
