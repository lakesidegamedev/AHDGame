"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BLEND, FONT } from "@/components/blend/tokens";
import { useBlendGround } from "@/components/blend/useBlendGround";
import { readableInk } from "@/lib/elections/marginTierShade";
import type { ElectionResponse } from "@/lib/elections/electionResponseTypes";
import type { RaceWireItem } from "@/lib/elections/raceWireFeed";
import {
  lastDelta,
  partyLines,
  pollingSeries,
  raceLines,
  raceStanding,
  seatSummary,
  type CmCandidate,
  type CmRace,
} from "@/lib/campaignManager/rules";
import { raceTitle, typeLabel } from "../raceLabels";
import { EYEBROW, ratingChipStyle, tierShade } from "../ui";
import { PollingChart } from "./PollingChart";

export interface RaceViewProps {
  countryId: string;
  regionNames: Record<string, string>;
  race: CmRace | null;
  full: ElectionResponse | null;
  wire: RaceWireItem[];
  watched: boolean;
  onToggleWatch: () => void;
  selectedCandidateId: string | null;
  onSelectCandidate: (candidateId: string) => void;
  /** Phone width: the table keeps name, poll and change; the sheet shows the rest. */
  compact?: boolean;
}

const fmtDelta = (d: number) => `${d > 0 ? "+" : ""}${d.toFixed(1)}`;

/** The selected race: header, standing bars, candidates, polling and wire. */
export function RaceView(props: RaceViewProps) {
  const t = useTranslations("elections.campaignManager");
  const ground = useBlendGround();
  const { race, full } = props;
  const series = useMemo(() => (race && full ? pollingSeries(full, race) : []), [race, full]);

  if (!race) {
    return <p style={{ margin: 0, padding: "18px 0", color: BLEND.muted }}>{t("race.pick")}</p>;
  }

  const title = raceTitle(race, t, props.countryId, props.regionNames);
  const cols = props.compact ? "minmax(0,1fr) 64px 52px" : "minmax(0,1fr) 80px 64px 64px 72px";
  const standing = raceStanding(race);
  const shade = tierShade(standing.leaderColor, standing.tier, ground);
  const lines = raceLines(race);
  const total = lines.reduce((s, l) => s + l.share, 0);
  const undecided = Math.max(0, 100 - total);
  const seats = seatSummary(race);
  const partyAbbr = new Map(partyLines(race).map((l) => [l.partyId, l]));
  const lineOf = (c: CmCandidate) => (race.multiSeat ? c.partyId : c.id);
  const lineShare = (c: CmCandidate) =>
    race.multiSeat ? (partyAbbr.get(c.partyId)?.share ?? 0) : c.share;
  const people = race.multiSeat
    ? [...race.candidates].sort((a, b) => lineShare(b) - lineShare(a))
    : race.candidates;
  const slotOf = new Map<string, number>();
  if (race.multiSeat) {
    const perParty = new Map<string, number>();
    for (const c of race.candidates) {
      const n = (perParty.get(c.partyId) ?? 0) + 1;
      perParty.set(c.partyId, n);
      slotOf.set(c.id, n);
    }
  }

  return (
    <article aria-label={title} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{title}</h2>
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
            <span>{t(race.stage === "primary" ? "race.stagePrimary" : "race.stageGeneral")}</span>
            {race.turnsLeft != null ? (
              <span style={{ color: race.turnsLeft <= 1 ? BLEND.caution : BLEND.muted }}>
                {t("race.turnsLeft", { n: race.turnsLeft })}
              </span>
            ) : null}
          </p>
        </div>
        {race.hasPolling ? (
          <span style={ratingChipStyle(shade.fill, shade.ink)}>{t(`tier.${standing.tier}`)}</span>
        ) : null}
        <Link
          href={`/elections/${race.electionId}`}
          style={{
            minHeight: 32,
            display: "inline-flex",
            alignItems: "center",
            padding: "0 12px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            color: BLEND.ink,
            border: `1px solid ${BLEND.hairlineStrong}`,
            textDecoration: "none",
          }}
        >
          {t("race.electionPage")}
        </Link>
        <button
          type="button"
          aria-pressed={props.watched}
          onClick={props.onToggleWatch}
          style={{
            minHeight: 32,
            padding: "0 12px",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
            background: "transparent",
            color: props.watched ? BLEND.caution : BLEND.ink,
            border: `1px solid ${props.watched ? BLEND.caution : BLEND.hairlineStrong}`,
          }}
        >
          {props.watched ? t("race.watching") : t("race.watch")}
        </button>
      </header>

      {race.candidates.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: BLEND.muted }}>
          {t("race.openPrimary")}{" "}
          <Link
            href={`/elections/${race.electionId}`}
            style={{ color: BLEND.ink, fontWeight: 600 }}
          >
            {t("race.enter")}
          </Link>
        </p>
      ) : race.stage === "primary" ? (
        <p style={{ margin: 0, fontSize: 13, color: BLEND.muted }}>
          {race.turnsLeft != null
            ? t("race.primaryNote", { party: race.primaryPartyName ?? "", n: race.turnsLeft })
            : t("race.primaryNoteOpen", { party: race.primaryPartyName ?? "" })}
        </p>
      ) : null}

      {race.hasPolling ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div
            style={{
              display: "flex",
              height: 14,
              borderRadius: 4,
              overflow: "hidden",
              background: BLEND.track,
            }}
          >
            {lines.map((l) => (
              <span
                key={l.id}
                title={`${l.name} ${l.share.toFixed(1)}%`}
                style={{ width: `${l.share}%`, background: l.color }}
              />
            ))}
          </div>
          <p
            style={{
              margin: 0,
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              fontSize: 13,
            }}
          >
            <span>
              {t("race.leadBy", {
                leader: standing.leaderName,
                margin: standing.margin.toFixed(1),
              })}
            </span>
            {undecided >= 0.5 ? (
              <span style={{ color: BLEND.muted }}>
                {t("race.undecided", { pct: `${undecided.toFixed(1)}%` })}
              </span>
            ) : null}
          </p>
        </section>
      ) : race.candidates.length > 0 && race.stage === "general" ? (
        <p style={{ margin: 0, fontSize: 13, color: BLEND.muted }}>{t("race.noVotes")}</p>
      ) : null}

      {seats ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={EYEBROW}>{t("race.seatTitle")}</span>
            <span style={{ fontFamily: FONT.mono, fontSize: 12, color: BLEND.muted }}>
              {t("race.majority", { majority: seats.majority, total: seats.total })}
            </span>
          </div>
          <div
            style={{
              position: "relative",
              display: "flex",
              height: 22,
              borderRadius: 4,
              overflow: "hidden",
              background: BLEND.track,
            }}
          >
            {seats.order.map((o) => {
              const line = partyAbbr.get(o.partyId);
              const color = line?.partyColor ?? BLEND.mutedDim;
              const w = (o.seats / seats.total) * 100;
              return (
                <span
                  key={o.partyId}
                  title={`${line?.partyAbbr ?? o.partyId} ${o.seats}`}
                  style={{
                    width: `${w}%`,
                    background: color,
                    color: readableInk(color),
                    fontSize: 11,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                  }}
                >
                  {w > 7 ? `${line?.partyAbbr ?? ""} ${o.seats}` : ""}
                </span>
              );
            })}
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${(seats.majority / seats.total) * 100}%`,
                width: 2,
                background: BLEND.ink,
              }}
            />
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: BLEND.muted }}>
            {(() => {
              const abbr = partyAbbr.get(seats.leaderPartyId)?.partyAbbr ?? "";
              const seatsHeld = seats.order[0].seats;
              return seats.leaderHasMajority
                ? t("race.seatMajority", { abbr, seats: seatsHeld })
                : t("race.seatShort", { abbr, short: seats.shortBy });
            })()}
          </p>
        </section>
      ) : null}

      <section>
        <div
          role="row"
          style={{
            display: "grid",
            gridTemplateColumns: cols,
            gap: 8,
            padding: "0 12px 6px",
            ...EYEBROW,
          }}
        >
          <span>{race.multiSeat ? t("race.colCandidateSlate") : t("race.colCandidate")}</span>
          <span style={{ textAlign: "right" }}>
            {race.multiSeat ? t("race.colPartyPoll") : t("race.colPoll")}
          </span>
          <span style={{ textAlign: "right" }}>{t("race.colChange")}</span>
          {props.compact ? null : <span style={{ textAlign: "right" }}>{t("race.colFavor")}</span>}
          {props.compact ? null : (
            <span style={{ textAlign: "right" }}>{t("race.colInfluence")}</span>
          )}
        </div>
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {people.map((c) => {
            const d = lastDelta(series, lineOf(c));
            const on = c.id === props.selectedCandidateId;
            const party = race.multiSeat ? `${c.partyName} · #${slotOf.get(c.id)}` : c.partyName;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => props.onSelectCandidate(c.id)}
                  style={{
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns: cols,
                    gap: 8,
                    alignItems: "center",
                    minHeight: 52,
                    padding: "6px 12px",
                    borderRadius: 10,
                    cursor: "pointer",
                    color: BLEND.ink,
                    textAlign: "left",
                    background: on ? BLEND.trackAlt : "transparent",
                    border: `1px solid ${on ? BLEND.accent : "transparent"}`,
                    fontFamily: FONT.sans,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <Avatar candidate={c} />
                    <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          display: "flex",
                          gap: 6,
                          alignItems: "center",
                        }}
                      >
                        {c.name}
                        {c.isYou ? (
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: BLEND.accentInk }}>
                            {t("race.you")}
                          </span>
                        ) : !c.isNPP ? (
                          <span style={{ fontSize: 10.5, fontWeight: 600, color: BLEND.muted }}>
                            {t("race.player")}
                          </span>
                        ) : null}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: BLEND.muted,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {party}
                      </span>
                    </span>
                  </span>
                  <span style={{ textAlign: "right", fontFamily: FONT.mono, fontSize: 13 }}>
                    {lineShare(c).toFixed(1)}%
                  </span>
                  <span
                    style={{
                      textAlign: "right",
                      fontFamily: FONT.mono,
                      fontSize: 12.5,
                      color: d > 0 ? BLEND.positive : d < 0 ? BLEND.negative : BLEND.muted,
                    }}
                  >
                    {fmtDelta(d)}
                  </span>
                  {props.compact ? null : (
                    <span style={{ textAlign: "right", fontFamily: FONT.mono, fontSize: 12.5 }}>
                      {Math.round(c.favorability)}%
                    </span>
                  )}
                  {props.compact ? null : (
                    <span style={{ textAlign: "right", fontFamily: FONT.mono, fontSize: 12.5 }}>
                      {Math.round(c.influence)}%
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {race.multiSeat ? (
          <p style={{ margin: "8px 12px 0", fontSize: 12, color: BLEND.muted }}>
            {t("race.tableNote")}
          </p>
        ) : null}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 style={{ ...EYEBROW, margin: 0 }}>{t("chart.title")}</h3>
        <PollingChart
          series={series}
          lines={lines.map((l) => ({
            id: l.id,
            name: race.multiSeat ? l.abbr : l.name,
            color: l.color,
          }))}
          turnLabel={race.stage === "primary" ? "count" : "turn"}
        />
      </section>

      <RaceWire items={props.wire} />
    </article>
  );
}

function Avatar({ candidate }: { candidate: CmCandidate }) {
  const ink = readableInk(candidate.color || "#888888");
  const initials = candidate.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return candidate.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- avatars are user-uploaded URLs on arbitrary hosts
    <img
      src={candidate.avatarUrl}
      alt=""
      width={36}
      height={36}
      style={{ flex: "none", borderRadius: "50%", objectFit: "cover" }}
    />
  ) : (
    <span
      aria-hidden="true"
      style={{
        flex: "none",
        width: 36,
        height: 36,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        fontSize: 12,
        fontWeight: 700,
        color: ink,
        background: candidate.color || BLEND.mutedDim,
        boxShadow: candidate.isYou
          ? `0 0 0 2px ${BLEND.page}, 0 0 0 4px ${BLEND.accent}`
          : undefined,
      }}
    >
      {initials}
    </span>
  );
}

function RaceWire({ items }: { items: RaceWireItem[] }) {
  const t = useTranslations("elections.campaignManager.wire");
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h3 style={{ ...EYEBROW, margin: 0 }}>{t("title")}</h3>
      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: BLEND.muted }}>{t("empty")}</p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {items.map((item) => (
            <li
              key={`${item.timestamp}:${item.headline}`}
              style={{ display: "flex", gap: 10, fontSize: 13 }}
            >
              <time
                dateTime={item.timestamp}
                style={{
                  flex: "none",
                  width: 64,
                  fontFamily: FONT.mono,
                  fontSize: 11.5,
                  color: BLEND.mutedDim,
                }}
              >
                {relativeTime(item.timestamp)}
              </time>
              {item.href ? (
                <a href={item.href} style={{ color: BLEND.ink }}>
                  {item.headline}
                </a>
              ) : (
                <span>{item.headline}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const RTF =
  typeof Intl !== "undefined"
    ? new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" })
    : null;
/** "5 min. ago", "2 hr. ago". The wire only ever holds the last 48 hours. */
function relativeTime(iso: string): string {
  const mins = Math.round((Date.parse(iso) - Date.now()) / 60_000);
  if (!RTF || !Number.isFinite(mins)) return "";
  return Math.abs(mins) < 60
    ? RTF.format(mins, "minute")
    : RTF.format(Math.round(mins / 60), "hour");
}
