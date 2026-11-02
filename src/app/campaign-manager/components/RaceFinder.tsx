"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { BLEND, FONT } from "@/components/blend/tokens";
import { BlendInput, BlendSelect } from "@/components/blend/BlendControls";
import { useBlendGround } from "@/components/blend/useBlendGround";
import {
  filterRaces,
  raceStanding,
  sortRaces,
  type CmRace,
  type CmScope,
  type RaceFilter,
} from "@/lib/campaignManager/rules";
import { raceTitle, typeLabel } from "../raceLabels";
import { EYEBROW, MONO_COUNT, chipStyle, ratingChipStyle, segmentStyle, tierShade } from "../ui";

export interface RaceFinderProps {
  countryId: string;
  races: CmRace[];
  filter: RaceFilter;
  onFilter: (patch: Partial<Omit<RaceFilter, "regionNames">>) => void;
  selectedKey: string | null;
  onSelect: (race: CmRace) => void;
  watched: ReadonlySet<string>;
  onToggleWatch: (key: string) => void;
  regionNoun: string;
  regionNounPlural: string;
}

const STAGES = [
  { id: "all", key: "stageAll" },
  { id: "primary", key: "stagePrimary" },
  { id: "general", key: "stageGeneral" },
] as const;

/** Find a Race: race types by scope, the stage switch, a region, search, and the list. */
export function RaceFinder({
  countryId,
  races,
  filter,
  onFilter,
  selectedKey,
  onSelect,
  watched,
  onToggleWatch,
  regionNoun,
  regionNounPlural,
}: RaceFinderProps) {
  const t = useTranslations("elections.campaignManager");
  const ground = useBlendGround();
  const { regionNames } = filter;

  const types = useMemo(() => {
    const seen = new Map<string, { type: string; scope: CmScope; count: number }>();
    for (const r of races) {
      const entry = seen.get(r.electionType) ?? { type: r.electionType, scope: r.scope, count: 0 };
      if (filter.stage === "all" || r.stage === filter.stage) entry.count += 1;
      seen.set(r.electionType, entry);
    }
    return [...seen.values()].sort((a, b) =>
      typeLabel(a.type, countryId).localeCompare(typeLabel(b.type, countryId))
    );
  }, [races, filter.stage, countryId]);

  const ofType = useMemo(
    () => races.filter((r) => r.electionType === filter.type),
    [races, filter.type]
  );
  const stageCount = (stage: "all" | "primary" | "general") =>
    ofType.filter((r) => stage === "all" || r.stage === stage).length;

  const regionOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of ofType) {
      if (filter.stage !== "all" && r.stage !== filter.stage) continue;
      counts.set(r.regionId, (counts.get(r.regionId) ?? 0) + 1);
    }
    return Object.entries(regionNames)
      .sort(([, a], [, b]) => a.localeCompare(b))
      .map(([id, name]) => ({ id, name, count: counts.get(id) ?? 0 }));
  }, [ofType, filter.stage, regionNames]);

  const list = sortRaces(filterRaces(races, filter), watched);
  const allRegions = filter.regionId === "ALL";
  const regionName = regionNames[filter.regionId] ?? filter.regionId;

  return (
    <aside
      aria-label={t("finder.title")}
      style={{ padding: "18px 16px", display: "flex", flexDirection: "column", gap: 14 }}
    >
      <h2 style={{ margin: 0, fontFamily: FONT.sans, fontSize: 16, fontWeight: 700 }}>
        {t("finder.title")}
      </h2>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={EYEBROW}>{t("finder.searchLabel")}</span>
        <BlendInput
          type="search"
          value={filter.query}
          placeholder={t("finder.searchPlaceholder", { noun: regionNoun.toLowerCase() })}
          onChange={(e) => onFilter({ query: e.target.value })}
        />
      </label>

      {(["national", "regional"] as const).map((scope) => {
        const group = types.filter((x) => x.scope === scope);
        if (group.length === 0) return null;
        return (
          <div
            key={scope}
            role="group"
            aria-label={t(scope === "national" ? "finder.nationalGroup" : "finder.regionalGroup")}
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
          >
            <span style={EYEBROW}>
              {t(scope === "national" ? "finder.national" : "finder.regional")}
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {group.map((x) => (
                <button
                  key={x.type}
                  type="button"
                  aria-pressed={filter.type === x.type}
                  onClick={() => onFilter({ type: x.type })}
                  style={chipStyle(filter.type === x.type)}
                >
                  {typeLabel(x.type, countryId)} <span style={MONO_COUNT}>{x.count}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={EYEBROW}>{t("finder.stage")}</span>
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
            borderRadius: 9,
          }}
        >
          {STAGES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={filter.stage === s.id}
              onClick={() => onFilter({ stage: s.id })}
              style={segmentStyle(filter.stage === s.id)}
            >
              {t(`finder.${s.key}`)} <span style={MONO_COUNT}>{stageCount(s.id)}</span>
            </button>
          ))}
        </div>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={EYEBROW}>{regionNoun}</span>
        <BlendSelect
          value={filter.regionId}
          onChange={(e) => onFilter({ regionId: e.target.value })}
        >
          <option value="ALL">
            {t("finder.allRegions", { nounPlural: regionNounPlural.toLowerCase() })}
          </option>
          {regionOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.count > 0 ? t("finder.regionOption", { name: o.name, count: o.count }) : o.name}
            </option>
          ))}
        </BlendSelect>
      </label>

      <p style={{ margin: 0, fontFamily: FONT.mono, fontSize: 12, color: BLEND.muted }}>
        {allRegions
          ? t("finder.countNationwide", { count: list.length })
          : t("finder.countIn", { count: list.length, region: regionName })}
      </p>

      {list.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: BLEND.muted }}>
          {filter.query.trim() || allRegions
            ? t("finder.emptySearch")
            : t("finder.emptyRegion", {
                type: typeLabel(filter.type, countryId).toLowerCase(),
                region: regionName,
                noun: regionNoun.toLowerCase(),
              })}
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {list.map((race) => (
            <RaceRow
              key={race.key}
              race={race}
              title={raceTitle(race, t, countryId, regionNames)}
              selected={race.key === selectedKey}
              watched={watched.has(race.key)}
              ground={ground}
              onSelect={() => onSelect(race)}
              onToggleWatch={() => onToggleWatch(race.key)}
            />
          ))}
        </ul>
      )}
    </aside>
  );
}

function RaceRow({
  race,
  title,
  selected,
  watched,
  ground,
  onSelect,
  onToggleWatch,
}: {
  race: CmRace;
  title: string;
  selected: boolean;
  watched: boolean;
  ground: string;
  onSelect: () => void;
  onToggleWatch: () => void;
}) {
  const t = useTranslations("elections.campaignManager");
  const s = raceStanding(race);
  const shade = tierShade(s.leaderColor, s.tier, ground);
  const leaderLine =
    race.candidates.length === 0
      ? t("finder.noFilers")
      : !race.hasPolling
        ? t("finder.noVotes")
        : s.runnerUpName
          ? t("finder.leads", { leader: s.leaderName, runnerUp: s.runnerUpName })
          : t("finder.unopposed", { leader: s.leaderName });
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        borderRadius: 10,
        paddingRight: 2,
        background: selected ? BLEND.trackAlt : BLEND.field,
        border: `1px solid ${selected ? BLEND.accent : BLEND.hairline}`,
      }}
    >
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "left",
          display: "flex",
          gap: 8,
          padding: "8px 10px",
          background: "transparent",
          border: 0,
          color: BLEND.ink,
          cursor: "pointer",
          fontFamily: FONT.sans,
        }}
      >
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
            {race.classNum ? (
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: BLEND.muted,
                  border: `1px solid ${BLEND.chipBorder}`,
                  borderRadius: 5,
                  padding: "0 5px",
                }}
              >
                {t("classLabel", { n: race.classNum })}
              </span>
            ) : null}
            {race.isMine ? (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: BLEND.accentInk }}>
                {t("yourRace")}
              </span>
            ) : null}
          </span>
          <span style={{ fontSize: 12, color: BLEND.muted }}>{leaderLine}</span>
        </span>
        {race.hasPolling ? (
          <span
            style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}
          >
            <span style={ratingChipStyle(shade.fill, shade.ink)}>{t(`tier.${s.tier}`)}</span>
            <span style={{ fontFamily: FONT.mono, fontSize: 11.5, color: BLEND.muted }}>
              {t("finder.margin", { abbr: s.leaderAbbr, margin: s.margin.toFixed(1) })}
            </span>
          </span>
        ) : null}
      </button>
      <button
        type="button"
        aria-pressed={watched}
        aria-label={
          watched ? t("finder.unwatch", { race: title }) : t("finder.watch", { race: title })
        }
        onClick={onToggleWatch}
        style={{
          flex: "none",
          width: 34,
          height: 34,
          display: "grid",
          placeItems: "center",
          background: "transparent",
          border: 0,
          cursor: "pointer",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 3l2.7 5.6 6.2.9-4.5 4.3 1.1 6.2L12 17.1 6.5 20l1.1-6.2L3.1 9.5l6.2-.9z"
            fill={watched ? BLEND.caution : "none"}
            stroke={watched ? BLEND.caution : BLEND.muted}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </li>
  );
}
