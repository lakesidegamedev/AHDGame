"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface WikiElectionSummary {
  id: string;
  electionType: string;
  state: string;
  stateName: string;
  senateClass?: number;
  cycle: number;
  totalSeats?: number;
  endTime: string;
  year: number;
  label: string;
}

interface ElectionGroup {
  key: string;
  year: number;
  type: string;
  typeLabel: string;
  count: number;
  items: WikiElectionSummary[];
}

interface StateGroup {
  key: string;
  stateId: string;
  stateName: string;
  type: string;
  typeLabel: string;
  count: number;
  items: WikiElectionSummary[];
}

export default function WikiElectionsPage() {
  const [groups, setGroups] = useState<ElectionGroup[]>([]);
  const [stateGroups, setStateGroups] = useState<StateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/wiki/elections")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data: { groups: ElectionGroup[]; stateGroups?: StateGroup[] }) => {
        setGroups(data.groups ?? []);
        setStateGroups(data.stateGroups ?? []);
      })
      .catch(() => setError("Failed to load elections"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-[860px] px-4 py-7 sm:px-8">
      <nav className="mb-6 flex items-center gap-2 text-body text-muted">
        <Link href="/wiki" className="hover:text-foreground">
          Wiki
        </Link>
        <span aria-hidden>/</span>
        <span className="text-foreground">Elections</span>
      </nav>

      <header className="mb-10">
        <h1 className="mb-2 text-display font-extrabold leading-[1.15] tracking-[-0.03em] text-foreground">
          Election history
        </h1>
        <p className="text-heading text-muted">
          Browse by year and type (e.g. 2020 Governors) or by state and type (e.g. Florida
          Governor). Click any election for full details.
        </p>
        <Link
          href="/wiki/election-mechanics"
          className="mt-3 inline-block text-body text-primary hover:underline"
        >
          How elections work →
        </Link>
      </header>

      {loading && <div className=" text-center text-muted">Loading elections…</div>}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center text-red-400">
          {error}
        </div>
      )}

      {!loading && !error && groups.length === 0 && (
        <div className=" text-center text-muted">
          No completed elections yet. Elections will appear here once they are resolved.
        </div>
      )}

      {!loading && !error && groups.length > 0 && (
        <div className="space-y-10">
          {/* By year and type */}
          <section>
            <h2 className="mb-4 text-heading font-extrabold tracking-[-0.03em] text-foreground">
              By year and type
            </h2>
            <p className="mb-4 text-body text-muted">
              View all elections for a given year and office type (e.g. 2020 Governors, 2024 House).
            </p>
            <div className="mb-6 flex flex-wrap gap-2">
              {groups
                .sort((a, b) => b.year - a.year || a.type.localeCompare(b.type))
                .map((group) => (
                  <Link
                    key={group.key}
                    href={`/wiki/elections/browse/${group.year}/${group.type}`}
                    className="border-b border-card-border/60 py-2.5 text-body font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-card/60"
                  >
                    {group.typeLabel} ({group.count})
                  </Link>
                ))}
            </div>
          </section>

          {/* By state and type */}
          {stateGroups.length > 0 && (
            <section>
              <h2 className="mb-4 text-heading font-extrabold tracking-[-0.03em] text-foreground">
                By state and type
              </h2>
              <p className="mb-4 text-body text-muted">
                View all elections for a state and office type (e.g. Florida Governor, California
                House).
              </p>
              <div className="mb-6 flex flex-wrap gap-2">
                {stateGroups
                  .sort(
                    (a, b) => a.stateName.localeCompare(b.stateName) || a.type.localeCompare(b.type)
                  )
                  .map((group) => (
                    <Link
                      key={group.key}
                      href={`/wiki/elections/browse/${group.stateId}/${group.type}`}
                      className="border-b border-card-border/60 py-2.5 text-body font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-card/60"
                    >
                      {group.typeLabel} ({group.count})
                    </Link>
                  ))}
              </div>
            </section>
          )}

          {/* Full list by year */}
          <section>
            <h2 className="mb-4 text-heading font-extrabold tracking-[-0.03em] text-foreground">
              All elections
            </h2>
            <div className="space-y-6">
              {groups
                .sort((a, b) => b.year - a.year || a.type.localeCompare(b.type))
                .map((group) => (
                  <div key={group.key} className="">
                    <h3 className="mb-4 text-body-lg font-medium text-foreground">
                      <Link
                        href={`/wiki/elections/browse/${group.year}/${group.type}`}
                        className="hover:text-primary"
                      >
                        {group.typeLabel}
                      </Link>
                    </h3>
                    <p className="mb-4 text-body text-muted">
                      {group.count} election{group.count !== 1 ? "s" : ""} completed
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {group.items.map((item) => (
                        <Link
                          key={item.id}
                          href={`/wiki/elections/${item.id}`}
                          className="flex items-center justify-between border-b border-card-border/60 py-2.5 transition-colors hover:border-primary/40 hover:bg-card/80"
                        >
                          <span className="font-medium text-foreground">{item.label}</span>
                          <span className="text-muted">→</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
