"use client";

import { useRouter } from "next/navigation";
import { CrisisV2Strip } from "@/components/crises/CrisisV2Strip";
import type { CrisisV2Detail as Detail, CrisisV2ScarView } from "@/lib/crises/queries/crisisV2View";
import { STAGE_LABEL, type LedgerRowView } from "@/lib/crises/v2/ledgerView";

const SCAR_LABEL: Record<CrisisV2ScarView["kind"], string> = {
  regionalOutput: "Lost regional output",
  plantCapacity: "Lost plant capacity",
  institutionalTrust: "Lost trust in institutions",
  population: "Lost population",
  creditStanding: "Damaged credit standing",
};

export function ledgerSentence(row: LedgerRowView): string {
  return row.action ? `${row.holderName} used "${row.action}"` : `${row.holderName} took no action`;
}

export function WhoDidWhat({ rows }: { rows: LedgerRowView[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="rounded-xl border border-card-border bg-card shadow-card">
      <div className="border-b border-card-border px-5 py-3">
        <h2 className="text-sm font-semibold text-foreground">Who did what</h2>
        <p className="mt-0.5 text-xs text-muted">
          What each office holder did about this crisis, newest first.
        </p>
      </div>
      <ul className="divide-y divide-card-border/60 text-sm">
        {rows.map((row, i) => (
          <li key={`${row.turn}-${row.role}-${i}`} className="flex flex-wrap gap-x-3 px-5 py-2">
            <span className="w-16 shrink-0 text-xs tabular-nums text-muted">Turn {row.turn}</span>
            <span className="min-w-0 flex-1">
              <span className="text-foreground">{ledgerSentence(row)}</span>{" "}
              <span className="text-xs text-muted">
                ({row.roleLabel}, {STAGE_LABEL[row.stage].toLowerCase()}, severity {row.severity})
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ScarList({ scars }: { scars: CrisisV2ScarView[] }) {
  if (scars.length === 0) return null;
  return (
    <section className="rounded-xl border border-card-border bg-card shadow-card">
      <div className="border-b border-card-border px-5 py-3">
        <h2 className="text-sm font-semibold text-foreground">Lasting damage</h2>
        <p className="mt-0.5 text-xs text-muted">Harm that outlasts the crisis and heals slowly.</p>
      </div>
      <ul className="divide-y divide-card-border/60 text-sm">
        {scars.map((scar, i) => (
          <li key={`${scar.kind}-${scar.target}-${i}`} className="px-5 py-2">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-foreground">
                {SCAR_LABEL[scar.kind]} in {scar.target}
              </span>
              <span className="text-xs text-muted">
                {scar.turnsToHeal > 0 ? `${scar.turnsToHeal} turns to heal` : "Healed"}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-card-elevated">
              <div
                className="h-full bg-success"
                style={{ width: `${Math.round(scar.healed * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Crisis v2 block for the detail page: stage, severity, forecast, levers, log and scars. */
export default function CrisisV2Detail({ crisisId, detail }: { crisisId: string; detail: Detail }) {
  const router = useRouter();
  const ended = detail.stage === "resolved";
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-card-border bg-card p-4 shadow-card">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          {ended ? "How it ended" : "Where it stands"}
        </h2>
        <CrisisV2Strip crisisId={crisisId} v2={detail} onPulled={() => router.refresh()} />
        {!ended && detail.levers.length === 0 && (
          <p className="mt-2 text-xs text-muted">You have no response to make on this crisis.</p>
        )}
      </section>
      <WhoDidWhat rows={detail.ledger} />
      <ScarList scars={detail.scars} />
    </div>
  );
}
