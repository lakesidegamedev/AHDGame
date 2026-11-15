"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { CrisisV2Strip } from "@/components/crises/CrisisV2Strip";
import {
  BAND_ROW_CLASS,
  CrisisEffectChip,
  CrisisThumb,
  SeverityTag,
} from "@/components/crises/CrisisRowParts";
import { useCountryDisplayName } from "@/contexts/RegisteredCountriesContext";
import type { CountryId } from "@/lib/constants/countriesCore";
import { crisisImageUrl } from "@/lib/crises/crisisImages";
import type { BoardCrisis } from "@/lib/crises/queries/crisisBoard";
import { crisisPlaceLabel } from "@/lib/crises/rules/crisisRow";
import { STAGE_LABEL } from "@/lib/crises/v2/ledgerView";
import {
  KIND_COLOR,
  KIND_LABEL,
  REASON_LABEL,
  formatDeadline,
  formatTurnsLeft,
} from "./crisisBoardStyle";

export function stageText(crisis: BoardCrisis): string {
  if (crisis.status === "resolved") return "Resolved";
  return crisis.v2 ? STAGE_LABEL[crisis.v2.stage] : "Ongoing";
}

function whoCanRespondText(crisis: BoardCrisis): string {
  if (crisis.viewerCanAct) return "You can respond now.";
  if (crisis.status === "resolved") return "This crisis is over.";
  if (crisis.whoCanAct) return `Waiting on a response from: ${crisis.whoCanAct}.`;
  const roles = crisis.v2?.responders.map((r) => r.role) ?? [];
  if (roles.length > 0) {
    return `No response for you. Can be answered by: ${roles.join(", ")}.`;
  }
  return "Nobody can respond directly. It runs its course.";
}

export function BoardCard({
  crisis,
  selected,
  regionNames,
  onPulled,
}: {
  crisis: BoardCrisis;
  selected: boolean;
  regionNames: Record<string, string>;
  onPulled?: () => void;
}) {
  // Collapsed until clicked; picking the crisis on the map opens it.
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? selected;
  const countryName = useCountryDisplayName();

  const resolved = crisis.status === "resolved";
  const deadline = formatDeadline(crisis.decisionDeadline);
  const place = crisisPlaceLabel(crisis, {
    country: (id) => countryName(id as CountryId),
    region: (id) => regionNames[id] ?? id,
  });
  const band = resolved ? "low" : crisis.severity;

  return (
    <div
      id={`crisis-${crisis.id}`}
      className={`overflow-hidden rounded-lg border bg-card text-sm ${BAND_ROW_CLASS[band]} ${
        selected ? "border-primary" : "border-card-border"
      } ${resolved ? "opacity-70" : ""}`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setToggled(!open)}
        className="flex w-full items-center gap-3 p-2.5 text-left hover:bg-card-elevated/60"
      >
        <CrisisThumb
          src={crisisImageUrl(
            { name: crisis.name, templateKey: crisis.templateKey, kind: crisis.kind },
            320
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold leading-snug text-foreground">
            {crisis.name}
          </span>
          <span className="block truncate text-xs text-muted">
            {place} · {stageText(crisis)}
          </span>
        </span>
        {crisis.viewerCanAct && (
          <span className="hidden shrink-0 text-xs font-medium text-success sm:inline">
            You can respond
          </span>
        )}
        {!resolved && <SeverityTag band={crisis.severity} score={crisis.severityScore} />}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-card-border p-3">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: KIND_COLOR[crisis.kind] }}
            />
            <span>{KIND_LABEL[crisis.kind]}</span>
            <span>·</span>
            <span>{resolved ? "Resolved" : formatTurnsLeft(crisis.turnsLeft)}</span>
            {deadline && !resolved && <span className="text-warning">{deadline}</span>}
          </div>

          <p className="text-sm text-foreground">{crisis.description}</p>

          {crisis.effects.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-semibold text-muted">What it does</h3>
              <div className="flex flex-wrap gap-1.5">
                {crisis.effects.map((effect, i) => (
                  <CrisisEffectChip key={i} effect={effect} />
                ))}
              </div>
            </div>
          )}

          {crisis.v2 && !resolved && (
            <CrisisV2Strip crisisId={crisis.id} v2={crisis.v2} onPulled={onPulled} />
          )}

          <p className="text-xs text-muted">{whoCanRespondText(crisis)}</p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
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
              {crisis.viewerCanAct ? "Respond" : "Full details"}
            </Link>
          </div>
        </div>
      )}
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
