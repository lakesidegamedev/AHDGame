"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BLEND, FONT } from "@/components/blend/tokens";
import type { ElectionResponse } from "@/lib/elections/electionResponseTypes";
import { ParticipationLedgerCard } from "@/components/elections/general/ParticipationLedgerCard";
import { FactorLedgerCard } from "@/components/elections/general/FactorLedgerCard";
import { PersuasionDrivers } from "@/components/elections/general/PersuasionDrivers";
import {
  persuasionDriverProps,
  type PersuasionDriverSource,
} from "@/components/elections/general/persuasionDriverProps";

type DetailRace = Pick<
  ElectionResponse,
  | "countryId"
  | "electionType"
  | "state"
  | "inPrimary"
  | "allCandidates"
  | "generalVotes"
  | "regionElectorate"
  | "factorLedger"
> &
  Omit<PersuasionDriverSource, "allCandidates">;

/**
 * The general's detail, collapsed under "Race detail": turnout against the
 * region's electorate, why people are voting (the latest turn's participation
 * ledger), what is moving the swing (persuasion drivers, for a regional
 * general) and the factor ledger, each only where the race carries it. The
 * same cards the election page shows.
 */
export function RaceDetail({
  election,
  regionName,
}: {
  election: DetailRace;
  /** The race's region, named for the drivers card. */
  regionName?: string;
}) {
  const t = useTranslations("elections.campaignManager.detail");
  const [open, setOpen] = useState(false);
  const gv = election.generalVotes;
  // Ballots counted for every candidate who stood, as the election page counts them.
  const ballots = gv
    ? (election.allCandidates ?? []).reduce((s, c) => s + (gv.totalVotes[c.id] ?? 0), 0)
    : 0;
  const electorate = election.regionElectorate;
  const turnout =
    electorate && electorate.count > 0 && ballots > 0 ? (ballots / electorate.count) * 100 : null;
  const participation = gv?.turnSnapshots?.at(-1)?.participation ?? null;
  const factorLedger = election.factorLedger ?? null;
  // Same gate as the election page: a single-region general with candidates.
  const showDrivers =
    !election.inPrimary &&
    election.electionType !== "president" &&
    !!election.state &&
    (election.allCandidates?.length ?? 0) > 0;
  const drivers = showDrivers ? persuasionDriverProps(election) : null;
  if (turnout == null && !participation && !factorLedger && !drivers) return null;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          alignSelf: "flex-start",
          padding: 0,
          border: 0,
          background: "transparent",
          cursor: "pointer",
          fontFamily: FONT.sans,
          fontSize: 12,
          fontWeight: 600,
          color: BLEND.accentInk,
        }}
      >
        {t("title")}
      </button>
      {open ? (
        <>
          {turnout != null && electorate ? (
            <p style={{ margin: 0, fontSize: 13 }}>
              {t("turnout", {
                pct: turnout.toFixed(1),
                basis: electorate.basis,
                ballots: Math.round(ballots).toLocaleString("en-US"),
              })}
            </p>
          ) : null}
          <ParticipationLedgerCard data={participation} />
          {drivers ? (
            <PersuasionDrivers
              stateId={election.state}
              stateName={regionName ?? election.state}
              candidates={drivers.candidates}
              inputs={drivers.inputs}
            />
          ) : null}
          {factorLedger && gv ? (
            <FactorLedgerCard
              countryId={election.countryId}
              data={factorLedger}
              candidates={Object.entries(gv.candidateNames ?? {}).map(([id, name]) => ({
                id,
                name,
                color: gv.candidateColors?.[id] ?? "#9CA3AF",
              }))}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
