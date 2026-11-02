"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { BLEND, FONT } from "@/components/blend/tokens";
import { BlendSelect } from "@/components/blend/BlendControls";
import {
  filterRaces,
  finishedYears,
  raceStanding,
  sortRaces,
  type CmRace,
  type RaceFilter,
} from "@/lib/campaignManager/rules";
import { raceTitle, typeLabel } from "../raceLabels";
import { MONO_COUNT, chipStyle, segmentStyle } from "../ui";

/**
 * The phone layout's pieces: the two-tab switch, the race strip that stands in
 * for the Find a Race rail, and the bottom sheet the Target card opens in.
 * Every row scrolls inside itself and every flex child carries min-width 0, so
 * nothing widens the page past the viewport (the body clips horizontal overflow).
 */

export function MobileTabs({
  tab,
  onTab,
}: {
  tab: "races" | "self";
  onTab: (tab: "races" | "self") => void;
}) {
  const t = useTranslations("elections.campaignManager.mobile");
  const style = (on: boolean): React.CSSProperties => ({
    minHeight: 40,
    border: 0,
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: FONT.sans,
    fontSize: 14,
    fontWeight: on ? 600 : 500,
    background: on ? BLEND.ink : "transparent",
    color: on ? BLEND.page : BLEND.muted,
  });
  return (
    <div
      role="tablist"
      aria-label={t("tabs")}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 2,
        padding: 3,
        background: BLEND.field,
        border: `1px solid ${BLEND.hairlineStrong}`,
        borderRadius: 11,
      }}
    >
      <button
        type="button"
        role="tab"
        aria-selected={tab === "races"}
        onClick={() => onTab("races")}
        style={style(tab === "races")}
      >
        {t("races")}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "self"}
        onClick={() => onTab("self")}
        style={style(tab === "self")}
      >
        {t("myMoves")}
      </button>
    </div>
  );
}

const STAGES = [
  { id: "all", key: "stageAll" },
  { id: "upcoming", key: "stageUpcoming" },
  { id: "primary", key: "stagePrimary" },
  { id: "general", key: "stageGeneral" },
  { id: "final", key: "stageFinal" },
] as const;

export function MobileRaceStrip({
  countryId,
  races,
  filter,
  onFilter,
  selectedKey,
  onSelect,
  watched,
}: {
  countryId: string;
  races: CmRace[];
  filter: RaceFilter;
  onFilter: (patch: Partial<Omit<RaceFilter, "regionNames">>) => void;
  selectedKey: string | null;
  onSelect: (race: CmRace) => void;
  watched: ReadonlySet<string>;
}) {
  const t = useTranslations("elections.campaignManager");
  const types = [...new Set(races.map((r) => r.electionType))];
  const list = sortRaces(filterRaces(races, filter), watched);
  const years = filter.stage === "final" ? finishedYears(races, filter.type) : [];
  const scroller: React.CSSProperties = {
    display: "flex",
    gap: 6,
    overflowX: "auto",
    minWidth: 0,
    paddingBottom: 2,
    WebkitOverflowScrolling: "touch",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={scroller}>
        {types.map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={filter.type === type}
            onClick={() => onFilter({ type })}
            style={chipStyle(filter.type === type, {
              flex: "none",
              minHeight: 40,
              borderRadius: 20,
              padding: "0 14px",
            })}
          >
            {typeLabel(type, countryId)}
          </button>
        ))}
      </div>
      <div
        role="group"
        aria-label={t("finder.stageGroup")}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 2,
          padding: 3,
          background: BLEND.field,
          border: `1px solid ${BLEND.hairlineStrong}`,
          borderRadius: 11,
        }}
      >
        {STAGES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={filter.stage === s.id}
            onClick={() => onFilter({ stage: s.id })}
            style={{ ...segmentStyle(filter.stage === s.id), minHeight: 38 }}
          >
            {t(`finder.${s.key}`)}
          </button>
        ))}
      </div>
      {filter.stage === "final" ? (
        years.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: BLEND.muted }}>{t("finder.noFinished")}</p>
        ) : (
          <BlendSelect
            aria-label={t("finder.finishedYear")}
            value={String(filter.year ?? years[0])}
            onChange={(e) => onFilter({ year: Number(e.target.value) })}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </BlendSelect>
        )
      ) : null}
      <div role="group" aria-label={t("mobile.raceChips")} style={scroller}>
        {list.map((race) => {
          const s = raceStanding(race);
          const on = race.key === selectedKey;
          return (
            <button
              key={race.key}
              type="button"
              aria-current={on ? "true" : undefined}
              onClick={() => onSelect(race)}
              style={{
                flex: "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 2,
                minHeight: 48,
                padding: "6px 12px",
                borderRadius: 11,
                cursor: "pointer",
                color: BLEND.ink,
                background: on ? BLEND.trackAlt : BLEND.field,
                border: `1px solid ${on ? BLEND.accent : BLEND.hairlineStrong}`,
                fontFamily: FONT.sans,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
                {raceTitle(race, t, countryId, filter.regionNames)}
              </span>
              <span style={{ ...MONO_COUNT, opacity: 1, color: BLEND.muted }}>
                {race.candidates.length === 0
                  ? t("finder.noFilers")
                  : race.hasPolling
                    ? t("finder.margin", { abbr: s.leaderAbbr, margin: s.margin.toFixed(1) })
                    : t("finder.noVotes")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("elections.campaignManager.mobile");
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          padding: "12px 16px 24px",
          background: BLEND.rail,
          borderTop: `1px solid ${BLEND.hairlineStrong}`,
          borderRadius: "16px 16px 0 0",
          color: BLEND.ink,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <strong style={{ fontSize: 15 }}>{title}</strong>
          <button
            type="button"
            onClick={onClose}
            style={{
              minHeight: 36,
              padding: "0 12px",
              borderRadius: 8,
              border: `1px solid ${BLEND.hairlineStrong}`,
              background: "transparent",
              color: BLEND.ink,
              cursor: "pointer",
            }}
          >
            {t("close")}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
