"use client";

import { InlineError } from "@/components/ui/InlineError";
import { apiErrorText } from "@/lib/errors/catalog";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RaceList, type Race } from "./endorsements/RaceList";
import { PartyChip } from "@/app/congress/components/CongressShared";
import type { CountryId } from "@/lib/constants/countriesCore";

export interface ActiveEndorsement {
  _id: string;
  electionId: string;
  candidateId: string;
  candidateName: string;
  electionTitle: string;
  partyId?: string;
  partyName?: string | null;
  partyColor?: string | null;
  partyLogoUrl?: string | null;
}

interface Props {
  countryId: string;
  stateId: string;
  activeEndorsements: ActiveEndorsement[];
  availableRaces: Race[];
  viewerIsHolder: boolean;
}

export function EndorsementsTab(props: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function withdraw(id: string) {
    if (!props.viewerIsHolder) return;
    setBusyId(id);
    setError(null);
    const res = await fetch(
      `/api/country/${props.countryId.toLowerCase()}/region/${props.stateId.toLowerCase()}/office/endorsements/${id}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(apiErrorText(data, "Withdraw failed."));
    } else {
      router.refresh();
    }
    setBusyId(null);
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-body font-semibold mb-1">Active candidate endorsements</h2>
        <p className="mb-2 text-body-sm text-muted">
          Endorsements you have given to election candidates. Endorsements an international
          organisation gives your country are joint statements, listed on that organisation&apos;s
          page.
        </p>
        <InlineError error={error} className="text-body text-error mb-2" />
        {props.activeEndorsements.length === 0 ? (
          <p className="text-body text-muted">You have not endorsed any candidates.</p>
        ) : (
          <ul className="space-y-2">
            {props.activeEndorsements.map((e) => (
              <li
                key={e._id}
                className="rounded-lg border border-card-border bg-card p-3 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{e.candidateName}</span>
                    {e.partyName && e.partyColor && (
                      <PartyChip
                        partyName={e.partyName}
                        partyColor={e.partyColor}
                        partyId={e.partyId}
                        countryId={props.countryId.toUpperCase() as CountryId}
                        logoUrl={e.partyLogoUrl}
                      />
                    )}
                  </div>
                  <div className="text-body-sm text-muted">{e.electionTitle}</div>
                </div>
                <button
                  onClick={() => withdraw(e._id)}
                  disabled={!props.viewerIsHolder || busyId === e._id}
                  className="rounded-lg border border-card-border px-3 py-1.5 text-body-sm text-muted hover:bg-background/60 disabled:opacity-50"
                >
                  {busyId === e._id ? "Withdrawing…" : "Withdraw"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-body font-semibold mb-2">Eligible races in this state</h2>
        <RaceList
          races={props.availableRaces}
          countryId={props.countryId}
          stateId={props.stateId}
          viewerIsHolder={props.viewerIsHolder}
          onChange={() => router.refresh()}
        />
      </section>
    </div>
  );
}
