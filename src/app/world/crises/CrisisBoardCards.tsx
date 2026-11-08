"use client";

import Link from "next/link";
import type { BoardCrisis } from "@/lib/crises/queries/crisisBoard";
import type { CrisisBoardGroup } from "@/lib/crises/rules/boardView";
import {
  KIND_COLOR,
  KIND_LABEL,
  REASON_LABEL,
  SEVERITY_BADGE,
  SEVERITY_LABEL,
  formatDeadline,
  formatTurnsLeft,
} from "./crisisBoardStyle";

export const GROUP_META: Record<CrisisBoardGroup, { title: string; hint: string }> = {
  needsResponse: { title: "Needs your response", hint: "You can act on these now." },
  escalating: { title: "Escalating", hint: "Severe, new, or waiting on a decision." },
  ongoing: { title: "Ongoing", hint: "Running their course." },
  windingDown: { title: "Winding down", hint: "Ending within two turns." },
  history: { title: "Recent history", hint: "Resolved in the last 48 turns." },
};

export const GROUP_ORDER: CrisisBoardGroup[] = [
  "needsResponse",
  "escalating",
  "ongoing",
  "windingDown",
  "history",
];

export function BoardCard({
  crisis,
  selected,
  onFocus,
}: {
  crisis: BoardCrisis;
  selected: boolean;
  onFocus?: (id: string) => void;
}) {
  const resolved = crisis.status === "resolved";
  const deadline = formatDeadline(crisis.decisionDeadline);
  return (
    <div
      id={`crisis-${crisis.id}`}
      className={`rounded-lg border bg-card p-3 text-sm ${
        selected ? "border-primary" : "border-card-border"
      } ${resolved ? "opacity-70" : ""}`}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: KIND_COLOR[crisis.kind] }}
          title={KIND_LABEL[crisis.kind]}
        />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onFocus?.(crisis.id)}
            className="block w-full text-left font-semibold leading-snug text-foreground hover:text-primary"
          >
            {crisis.name}
          </button>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted">{crisis.description}</p>
        </div>
        {!resolved && (
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${SEVERITY_BADGE[crisis.severity]}`}
          >
            {SEVERITY_LABEL[crisis.severity]}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>{resolved ? "Resolved" : formatTurnsLeft(crisis.turnsLeft)}</span>
        {crisis.whoCanAct && <span>Acts: {crisis.whoCanAct}</span>}
        {deadline && !resolved && <span className="text-warning">{deadline}</span>}
        {crisis.exposure
          .filter((r) => r !== "office")
          .map((r) => (
            <span key={r} className="rounded border border-card-border px-1.5 py-px">
              {REASON_LABEL[r]}
            </span>
          ))}
        <Link
          href={crisis.href}
          className={`ml-auto rounded-md px-2.5 py-1 font-medium ${
            crisis.viewerCanAct
              ? "bg-primary text-white hover:opacity-90"
              : "border border-card-border text-foreground hover:border-foreground/30"
          }`}
        >
          {crisis.viewerCanAct ? "Respond" : "Details"}
        </Link>
      </div>
    </div>
  );
}

export function ExposurePanel({
  crises,
  authenticated,
}: {
  crises: BoardCrisis[];
  authenticated: boolean;
}) {
  const touching = crises
    .filter((c) => c.status === "active" && c.exposure.length > 0)
    .sort((a, b) => Number(b.viewerCanAct) - Number(a.viewerCanAct));
  return (
    <aside className="rounded-xl border border-card-border bg-card p-3">
      <h2 className="text-sm font-semibold text-foreground">Your exposure</h2>
      {!authenticated ? (
        <p className="mt-2 text-xs text-muted">Sign in with a character to see what touches you.</p>
      ) : touching.length === 0 ? (
        <p className="mt-2 text-xs text-muted">
          No active crisis touches your country, state, corporations, holdings or office.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {touching.map((c) => {
            const deadline = formatDeadline(c.decisionDeadline);
            return (
              <li key={c.id} className="rounded-lg border border-card-border p-2 text-xs">
                <Link href={c.href} className="font-medium text-foreground hover:text-primary">
                  {c.name}
                </Link>
                <div className="mt-1 text-muted">
                  {c.exposure.map((r) => REASON_LABEL[r]).join(", ")}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {c.viewerCanAct ? (
                    <>
                      <span className="font-medium text-success">Action available</span>
                      {deadline && <span className="text-warning">{deadline}</span>}
                    </>
                  ) : (
                    <span className="text-muted">No action for you now</span>
                  )}
                  <span className="text-muted">{formatTurnsLeft(c.turnsLeft)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
