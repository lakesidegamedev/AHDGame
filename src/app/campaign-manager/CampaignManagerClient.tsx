"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { BlendShell } from "@/components/blend/BlendShell";
import { BLEND, FONT } from "@/components/blend/tokens";
import type { CmRace, RaceFilter } from "@/lib/campaignManager/rules";
import { useRaceIndex } from "./useRaceIndex";
import { useWatchedRaces } from "./useWatchedRaces";
import { RaceFinder } from "./components/RaceFinder";

export interface CampaignManagerClientProps {
  countryId: string;
  countryName: string;
  regionNoun: string;
  regionNounPlural: string;
  regionNames: Record<string, string>;
  nationalChamberKeys: string[];
  characterId: string;
  homeRegionId: string | null;
  initialRaceKey: string | null;
}

type FilterState = Omit<RaceFilter, "regionNames">;

/**
 * The Campaign Manager screen. Owns what is selected (race type, stage, region,
 * race, candidate, right-rail tab) and the data hooks; the panels are
 * presentational over that state.
 */
export default function CampaignManagerClient(props: CampaignManagerClientProps) {
  const t = useTranslations("elections.campaignManager");
  const { races, loading, error, reload } = useRaceIndex(
    props.countryId,
    props.nationalChamberKeys
  );
  const { watched, toggle: toggleWatch } = useWatchedRaces(props.characterId);
  const [pickedKey, setPickedKey] = useState<string | null>(props.initialRaceKey);
  const [chosenFilter, setChosenFilter] = useState<FilterState | null>(null);

  const myRace = useMemo(() => races.find((r) => r.isMine), [races]);
  // Until the player chooses, the page opens on the linked race, else their own
  // race, else the first race type in the country, nationwide.
  const filter = useMemo<RaceFilter | null>(() => {
    if (chosenFilter) return { ...chosenFilter, regionNames: props.regionNames };
    const start = races.find((r) => r.key === pickedKey) ?? myRace ?? races[0];
    if (!start) return null;
    return {
      type: start.electionType,
      stage: "all",
      regionId: start === races[0] && !myRace && !pickedKey ? "ALL" : start.regionId,
      query: "",
      regionNames: props.regionNames,
    };
  }, [chosenFilter, races, pickedKey, myRace, props.regionNames]);

  const selected: CmRace | null =
    races.find((r) => r.key === pickedKey) ?? (chosenFilter ? null : (myRace ?? null));

  const updateFilter = useCallback(
    (patch: Partial<FilterState>) => {
      if (!filter) return;
      const { regionNames: _names, ...current } = filter;
      setChosenFilter({ ...current, ...patch });
    },
    [filter]
  );

  const selectRace = useCallback(
    (race: CmRace) => {
      setPickedKey(race.key);
      if (filter && filter.regionId !== "ALL" && filter.regionId !== race.regionId) {
        updateFilter({ regionId: race.regionId });
      }
    },
    [filter, updateFilter]
  );

  return (
    <div
      style={{
        background: BLEND.page,
        color: BLEND.ink,
        fontFamily: FONT.sans,
        minHeight: "100vh",
      }}
    >
      <BlendShell
        fullBleed
        leftWidth={320}
        rightWidth={360}
        left={
          filter ? (
            <RaceFinder
              countryId={props.countryId}
              races={races}
              filter={filter}
              onFilter={updateFilter}
              selectedKey={selected?.key ?? null}
              onSelect={selectRace}
              watched={watched}
              onToggleWatch={toggleWatch}
              regionNoun={props.regionNoun}
              regionNounPlural={props.regionNounPlural}
            />
          ) : null
        }
      >
        <section style={{ padding: 24 }} aria-busy={loading}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>{t("title")}</h1>
          {loading ? <p style={{ color: BLEND.muted }}>{t("loading")}</p> : null}
          {!loading && error ? (
            <p role="alert" style={{ color: BLEND.negative }}>
              {t("loadError")}{" "}
              <button type="button" onClick={reload}>
                {t("retry")}
              </button>
            </p>
          ) : null}
        </section>
      </BlendShell>
    </div>
  );
}
