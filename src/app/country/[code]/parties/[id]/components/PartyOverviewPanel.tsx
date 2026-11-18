"use client";

import { PlainPositionLabel } from "@/components/party/PlainPositionLabel";
import {
  PARTY_LABEL_CLASS,
  PARTY_SECTION_HEADING_CLASS,
  PARTY_SUBHEADING_CLASS,
  PARTY_VALUE_CLASS,
} from "@/components/party/partyPageStyles";
import type { CommitteeData, PartyData } from "./types";
import { NationalPartyCommitteeRoster } from "./NationalPartyCommitteeRoster";
import { NationalPartyOfficerRow } from "./NationalPartyOfficerRow";

// ─── Props ────────────────────────────────────────────────────────────────────

interface PartyOverviewPanelProps {
  party: PartyData;
  committeeResult: CommitteeData | "unavailable" | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PartyOverviewPanel({ party, committeeResult }: PartyOverviewPanelProps) {
  const strengthPercent =
    party.effectivePsCap > 0
      ? Math.min(100, Math.max(0, ((party.politicalStrength ?? 0) / party.effectivePsCap) * 100))
      : 0;

  return (
    <div className="space-y-8">
      <NationalPartyOfficerRow party={party} />
      <NationalPartyCommitteeRoster countryId={party.countryId} committeeResult={committeeResult} />

      <section aria-labelledby="platform-title" className="min-w-0">
        <h2 id="platform-title" className={`mb-4 ${PARTY_SECTION_HEADING_CLASS}`}>
          Party platform
        </h2>

        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <p className={PARTY_LABEL_CLASS}>Strength capacity</p>
            <div className="mt-0.5 flex items-baseline justify-between gap-3">
              <p className={PARTY_VALUE_CLASS}>{strengthPercent.toFixed(0)}%</p>
              <p className="text-right text-body-sm text-muted">
                <span className="font-semibold tabular-nums text-foreground">
                  {(party.politicalStrength ?? 0).toFixed(1)}
                </span>{" "}
                of {party.effectivePsCap}
              </p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-card-border" aria-hidden>
              <div
                className="h-full rounded-full bg-foreground/70 transition-[width] duration-500"
                style={{ width: `${strengthPercent}%` }}
              />
            </div>
          </div>

          <IdeologyAxis
            label="Economic policy"
            descriptor="Left to right"
            value={party.economicPosition}
            axis="economic"
            start="Socialist"
            end="Laissez-faire"
          />
          <IdeologyAxis
            label="Social policy"
            descriptor="Liberal to conservative"
            value={party.socialPosition}
            axis="social"
            start="Progressive"
            end="Traditional"
          />
        </div>
      </section>
    </div>
  );
}

function IdeologyAxis({
  label,
  descriptor,
  value,
  axis,
  start,
  end,
}: {
  label: string;
  descriptor: string;
  value: number;
  axis: "economic" | "social";
  start: string;
  end: string;
}) {
  const percent = Math.min(100, Math.max(0, ((value + 5) / 10) * 100));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className={PARTY_SUBHEADING_CLASS}>{label}</h3>
          <p className="text-body-sm text-muted">{descriptor}</p>
        </div>
        <PlainPositionLabel
          value={value}
          axis={axis}
          className="text-body-lg font-semibold text-foreground"
        />
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-card-border" aria-hidden>
        <div
          className="h-full rounded-full bg-foreground/70 transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between gap-3 text-body-sm text-muted">
        <span>{start}</span>
        <span className="text-right">{end}</span>
      </div>
    </div>
  );
}
