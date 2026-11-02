"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { BlendShell } from "@/components/blend/BlendShell";
import { BLEND, FONT } from "@/components/blend/tokens";
import type { CmRace, RaceFilter } from "@/lib/campaignManager/rules";
import { useRaceIndex } from "./useRaceIndex";
import { useRaceDetail } from "./useRaceDetail";
import { useWatchedRaces } from "./useWatchedRaces";
import { RaceFinder } from "./components/RaceFinder";
import { RaceView } from "./components/RaceView";

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
  const { races, currentTurn, loading, error, reload } = useRaceIndex(
    props.countryId,
    props.nationalChamberKeys
  );
  const { watched, toggle: toggleWatch } = useWatchedRaces(props.characterId);
  const [pickedKey, setPickedKey] = useState<string | null>(props.initialRaceKey);
  const [chosenFilter, setChosenFilter] = useState<FilterState | null>(null);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [detailVersion, setDetailVersion] = useState(0);

  const myRace = useMemo(() => races.find((r) => r.isMine), [races]);
  // Until the player chooses, the page opens on the linked race, else their own
  // race, else the first race type in the country, nationwide.
  const filter = useMemo<RaceFilter | null>(() => {
    if (chosenFilter) return { ...chosenFilter, regionNames: props.regionNames };
    const linked = races.find((r) => r.key === pickedKey);
    const start = linked ?? myRace ?? races[0];
    if (!start) return null;
    return {
      type: start.electionType,
      stage: "all",
      regionId: linked || myRace ? start.regionId : "ALL",
      query: "",
      regionNames: props.regionNames,
    };
  }, [chosenFilter, races, pickedKey, myRace, props.regionNames]);

  const selected: CmRace | null =
    races.find((r) => r.key === pickedKey) ?? (chosenFilter ? null : (myRace ?? null));
  // A completed turn changes `currentTurn`, an action bumps `detailVersion`:
  // either re-reads the selected race's polling and wire.
  const detail = useRaceDetail(
    selected?.electionId ?? null,
    detailVersion * 100_000 + (currentTurn ?? 0)
  );

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
      setCandidateId(null);
      if (filter && filter.regionId !== "ALL" && filter.regionId !== race.regionId) {
        updateFilter({ regionId: race.regionId });
      }
    },
    [filter, updateFilter]
  );

  const refreshAfterAction = useCallback(() => {
    reload();
    setDetailVersion((v) => v + 1);
  }, [reload]);

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
        <section
          style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}
          aria-busy={loading}
        >
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>{t("title")}</h1>
          {loading ? <p style={{ color: BLEND.muted, margin: 0 }}>{t("loading")}</p> : null}
          {!loading && error ? (
            <p role="alert" style={{ color: BLEND.negative, margin: 0 }}>
              {t("loadError")}{" "}
              <button type="button" onClick={refreshAfterAction}>
                {t("retry")}
              </button>
            </p>
          ) : null}
          {!loading ? (
            <RaceView
              countryId={props.countryId}
              regionNames={props.regionNames}
              race={selected}
              full={detail.full}
              wire={detail.wire}
              watched={selected ? watched.has(selected.key) : false}
              onToggleWatch={() => selected && toggleWatch(selected.key)}
              selectedCandidateId={candidateId}
              onSelectCandidate={setCandidateId}
            />
          ) : null}
        </section>
      </BlendShell>
    </div>
  );
}
