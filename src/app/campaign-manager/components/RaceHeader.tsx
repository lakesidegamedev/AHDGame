"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BLEND } from "@/components/blend/tokens";
import { useBlendGround } from "@/components/blend/useBlendGround";
import { raceStanding, type CmRace } from "@/lib/campaignManager/rules";
import { raceTitle, typeLabel } from "../raceLabels";
import { ratingChipStyle, tierShade } from "../ui";

export interface RaceHeaderProps {
  race: CmRace;
  countryId: string;
  regionNames: Record<string, string>;
  watched: boolean;
  onToggleWatch: () => void;
  /** Previous / Next cycle arrows. */
  nav?: ReactNode;
  /** Enter race / Withdraw. */
  entry?: ReactNode;
}

const BUTTON = {
  minHeight: 32,
  display: "inline-flex",
  alignItems: "center",
  padding: "0 12px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
} as const;

/** "1994 Delaware Senate": the race title, led by its year when the race has one. */
export function useRaceHeading(
  race: CmRace,
  countryId: string,
  regionNames: Record<string, string>
): string {
  const t = useTranslations("elections.campaignManager");
  const title = raceTitle(race, t, countryId, regionNames);
  return race.year != null ? t("race.yearTitle", { year: race.year, title }) : title;
}

/** The race's title, stage line, rating chip and race-level buttons. */
export function RaceHeader(props: RaceHeaderProps) {
  const t = useTranslations("elections.campaignManager");
  const ground = useBlendGround();
  const { race } = props;
  const heading = useRaceHeading(race, props.countryId, props.regionNames);
  const standing = raceStanding(race);
  const shade = tierShade(standing.leaderColor, standing.tier, ground);
  const final = race.stage === "final";

  return (
    <header style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        {props.nav}
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{heading}</h2>
        <p
          style={{
            margin: "4px 0 0",
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            fontSize: 13,
            color: BLEND.muted,
          }}
        >
          <span>
            {typeLabel(race.electionType, props.countryId)}
            {race.multiSeat && race.totalSeats
              ? ` · ${t("race.seats", { n: race.totalSeats })}`
              : ""}
          </span>
          <span>
            {final
              ? t("race.final")
              : t(race.stage === "primary" ? "race.stagePrimary" : "race.stageGeneral")}
          </span>
          {!final && race.turnsLeft != null ? (
            <span style={{ color: race.turnsLeft <= 1 ? BLEND.caution : BLEND.muted }}>
              {t("race.turnsLeft", { n: race.turnsLeft })}
            </span>
          ) : null}
        </p>
      </div>
      {race.hasPolling ? (
        <span style={ratingChipStyle(shade.fill, shade.ink)}>{t(`tier.${standing.tier}`)}</span>
      ) : null}
      {props.entry}
      <Link
        href={`/elections/${race.electionId}`}
        style={{
          ...BUTTON,
          color: BLEND.ink,
          border: `1px solid ${BLEND.hairlineStrong}`,
          textDecoration: "none",
        }}
      >
        {t("race.electionPage")}
      </Link>
      {final ? null : (
        <button
          type="button"
          aria-pressed={props.watched}
          onClick={props.onToggleWatch}
          style={{
            ...BUTTON,
            cursor: "pointer",
            background: "transparent",
            color: props.watched ? BLEND.caution : BLEND.ink,
            border: `1px solid ${props.watched ? BLEND.caution : BLEND.hairlineStrong}`,
          }}
        >
          {props.watched ? t("race.watching") : t("race.watch")}
        </button>
      )}
    </header>
  );
}
