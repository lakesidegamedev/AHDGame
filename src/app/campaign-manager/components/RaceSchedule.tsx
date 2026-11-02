"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BLEND, FONT } from "@/components/blend/tokens";
import { useGameClock } from "@/contexts/useGameClock";
import type { ElectionResponse } from "@/lib/elections/electionResponseTypes";
import { EYEBROW } from "../ui";

type ScheduleRace = Pick<
  ElectionResponse,
  | "inPrimary"
  | "isEnded"
  | "isUpcoming"
  | "startTurn"
  | "primaryEndTurn"
  | "endTurn"
  | "startTime"
  | "primaryEndTime"
  | "endTime"
>;

interface Row {
  key: string;
  label: string;
  value: string;
  ended: boolean;
}

/**
 * The race's schedule: what is still ahead (primary end, voting close) with
 * turns to go and the in-game year, and behind "Show full schedule" every
 * stage. Counts down by turn like the election page's timeline (the game
 * clock's formatter), falling back to the timestamp on legacy rows.
 */
export function RaceSchedule({ election }: { election: ScheduleRace }) {
  const t = useTranslations("elections.campaignManager.schedule");
  const clock = useGameClock();
  const [open, setOpen] = useState(false);
  if (!election.endTime && !election.primaryEndTime) return null;

  const when = (turn: number | null | undefined, time: Date | string | null | undefined) => {
    const timer =
      turn != null ? clock.formatRemainingTurns(turn) : clock.formatRemaining(time ?? undefined);
    const year = clock.formatYear(time ?? null);
    return {
      text: year ? t("when", { timer: timer.text, year }) : timer.text,
      ended: timer.urgency === "ended",
    };
  };

  const opens = when(election.startTurn, election.startTime);
  const primary = when(election.primaryEndTurn, election.primaryEndTime);
  const closes = when(election.endTurn, election.endTime);
  const closeYear = clock.formatYear(election.endTime ?? null);
  const closeYearText = closeYear != null ? String(closeYear) : null;

  const rows: Row[] = [
    ...(election.startTime
      ? [
          {
            key: "opens",
            label: t(opens.ended ? "primaryOpened" : "primaryOpens"),
            value: opens.text,
            ended: opens.ended,
          },
        ]
      : []),
    ...(election.primaryEndTime
      ? [
          {
            key: "primary",
            label: t(
              primary.ended || !(election.inPrimary || election.isUpcoming)
                ? "primaryClosed"
                : "primaryEnds"
            ),
            value: primary.text,
            ended: primary.ended || !(election.inPrimary || election.isUpcoming),
          },
        ]
      : []),
    ...(election.endTime
      ? election.isEnded
        ? [
            {
              key: "closes",
              label: t("declared"),
              value: closeYearText ?? closes.text,
              ended: true,
            },
          ]
        : [{ key: "closes", label: t("closes"), value: closes.text, ended: closes.ended }]
      : []),
  ];
  // Collapsed: what is still ahead, or the result date once the race is over.
  const shown = open
    ? rows
    : election.isEnded
      ? rows.filter((r) => r.key === "closes")
      : rows.filter((r) => !r.ended);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <h3 style={{ ...EYEBROW, margin: 0 }}>{t("title")}</h3>
      <dl
        style={{
          margin: 0,
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) auto",
          gap: "4px 12px",
          fontSize: 13,
        }}
      >
        {shown.map((r) => (
          <div key={r.key} style={{ display: "contents" }}>
            <dt style={{ color: r.ended ? BLEND.mutedDim : BLEND.muted }}>{r.label}</dt>
            <dd
              style={{
                margin: 0,
                textAlign: "right",
                fontFamily: FONT.mono,
                fontSize: 12.5,
                color: r.ended ? BLEND.mutedDim : BLEND.ink,
              }}
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
      {rows.length > shown.length || open ? (
        <button
          type="button"
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
          {t(open ? "hide" : "show")}
        </button>
      ) : null}
    </section>
  );
}
