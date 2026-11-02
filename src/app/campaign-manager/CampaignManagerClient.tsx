"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { BlendShell } from "@/components/blend/BlendShell";
import { BLEND, FONT } from "@/components/blend/tokens";
import { resolveSelectedRace, type CmRace, type RaceFilter } from "@/lib/campaignManager/rules";
import { useRaceIndex } from "./useRaceIndex";
import { useRaceDetail } from "./useRaceDetail";
import { useWatchedRaces } from "./useWatchedRaces";
import { RaceFinder } from "./components/RaceFinder";
import { RaceView } from "./components/RaceView";
import { TargetPanel } from "./components/TargetPanel";
import { MyMovesPanel } from "./components/MyMovesPanel";
import { useActionsController } from "@/app/actions/useActionsController";
import { raceTitle } from "./raceLabels";
import { useElementWidth } from "./useElementWidth";
import { CampaignMap } from "./map/CampaignMap";
import { BottomSheet, MobileRaceStrip, MobileTabs } from "./components/MobileCampaignManager";
import { useIsDesktop } from "./useIsDesktop";
import { CampaignActionModal } from "@/app/actions/components/CampaignActionModal";

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

/** Centre-column width (px) from which the race sits beside the map. */
const SIDE_BY_SIDE_MIN = 1000;

/**
 * The Campaign Manager screen. Owns what is selected (race type, stage, region,
 * race, candidate, right-rail tab) and the data hooks; the panels are
 * presentational over that state.
 */
export default function CampaignManagerClient(props: CampaignManagerClientProps) {
  const t = useTranslations("elections.campaignManager");
  const {
    races: indexedRaces,
    currentTurn,
    loading,
    error,
    reload,
  } = useRaceIndex(props.countryId, props.nationalChamberKeys);
  const { watched, toggle: toggleWatch } = useWatchedRaces(props.characterId);
  const [pickedKey, setPickedKey] = useState<string | null>(props.initialRaceKey);
  const [chosenFilter, setChosenFilter] = useState<FilterState | null>(null);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [detailVersion, setDetailVersion] = useState(0);
  const [panel, setPanel] = useState<"target" | "self">("target");
  const isDesktop = useIsDesktop();
  // A wide centre column sets the race beside the map instead of under it.
  const [centreRef, centreWidth] = useElementWidth<HTMLElement>(0);
  const sideBySide = isDesktop && centreWidth >= SIDE_BY_SIDE_MIN;
  const [mobileTab, setMobileTab] = useState<"races" | "self">("races");
  const [sheetOpen, setSheetOpen] = useState(false);
  // My moves reports results as toasts, like the Actions page's compact view.
  const actions = useActionsController({ viewMode: "compact" });
  // The player's own favorability and influence move with every My moves action;
  // read them from the live character so the race table and Target card follow
  // without refetching every election in the country.
  const liveFav = actions.character?.favorability;
  const liveInfl = actions.character?.politicalInfluence;
  const races = useMemo(
    () =>
      liveFav == null && liveInfl == null
        ? indexedRaces
        : indexedRaces.map((r) =>
            r.isMine
              ? {
                  ...r,
                  candidates: r.candidates.map((c) =>
                    c.isYou
                      ? {
                          ...c,
                          favorability: liveFav ?? c.favorability,
                          influence: liveInfl ?? c.influence,
                        }
                      : c
                  ),
                }
              : r
          ),
    [indexedRaces, liveFav, liveInfl]
  );

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

  // A race the filter no longer shows (another type, stage or region) gives
  // way to the region's own race, so the panel and the map agree with the filter.
  const selected: CmRace | null = filter
    ? resolveSelectedRace(races, pickedKey, filter, watched)
    : null;
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
    void actions.fetchCharacter();
  }, [reload, actions]);

  // Choosing a region on the map keeps the race when it is there, else the
  // player's race there, else the region's closest race of the chosen type.
  const selectRegion = useCallback(
    (regionId: string) => {
      updateFilter({ regionId });
      if (regionId === "ALL" || !filter) return;
      if (selected?.regionId === regionId) return;
      const next = resolveSelectedRace(races, null, { ...filter, regionId }, watched);
      if (next) {
        setPickedKey(next.key);
        setCandidateId(null);
      }
    },
    [updateFilter, filter, selected, races, watched]
  );

  // Desktop shows the Target card in the right rail; a phone opens it in a sheet.
  const pickCandidate = useCallback(
    (id: string) => {
      setCandidateId(id);
      setPanel("target");
      if (!isDesktop) setSheetOpen(true);
    },
    [isDesktop]
  );

  const openMyRace = useCallback(() => {
    if (!myRace) return;
    setChosenFilter({
      type: myRace.electionType,
      stage: "all",
      regionId: myRace.regionId,
      query: "",
    });
    setPickedKey(myRace.key);
    setCandidateId(null);
  }, [myRace]);

  const candidate = selected?.candidates.find((c) => c.id === candidateId) ?? null;
  const tabStyle = (on: boolean): React.CSSProperties => ({
    minHeight: 46,
    border: 0,
    cursor: "pointer",
    fontFamily: FONT.sans,
    fontSize: 14,
    fontWeight: on ? 600 : 500,
    background: on ? BLEND.trackAlt : "transparent",
    color: on ? BLEND.ink : BLEND.muted,
    boxShadow: on ? `inset 0 -2px 0 ${BLEND.accent}` : "none",
  });
  const right = (
    <aside aria-label={t("tabs.group")} style={{ display: "flex", flexDirection: "column" }}>
      <div
        role="tablist"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          borderBottom: `1px solid ${BLEND.hairline}`,
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={panel === "target"}
          onClick={() => setPanel("target")}
          style={tabStyle(panel === "target")}
        >
          {t("tabs.target")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={panel === "self"}
          onClick={() => setPanel("self")}
          style={tabStyle(panel === "self")}
        >
          {t("tabs.myMoves")}
        </button>
      </div>
      <div role="tabpanel" style={{ padding: 16 }}>
        {panel === "target" ? (
          <TargetPanel
            race={selected}
            candidate={candidate}
            onActed={refreshAfterAction}
            onShowMyMoves={() => setPanel("self")}
          />
        ) : (
          <MyMovesPanel
            controller={actions}
            myRace={myRace}
            myRaceTitle={myRace ? raceTitle(myRace, t, props.countryId, props.regionNames) : null}
            onOpenRace={openMyRace}
          />
        )}
      </div>
    </aside>
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
        right={right}
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
          ref={centreRef}
          style={{
            padding: isDesktop ? "20px 24px" : "16px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
            minWidth: 0,
          }}
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
          {!isDesktop ? <MobileTabs tab={mobileTab} onTab={setMobileTab} /> : null}
          {!isDesktop && mobileTab === "races" && filter ? (
            <MobileRaceStrip
              countryId={props.countryId}
              races={races}
              filter={filter}
              onFilter={updateFilter}
              selectedKey={selected?.key ?? null}
              onSelect={selectRace}
              watched={watched}
            />
          ) : null}
          {!isDesktop && mobileTab === "self" ? (
            <MyMovesPanel
              controller={actions}
              myRace={myRace}
              myRaceTitle={myRace ? raceTitle(myRace, t, props.countryId, props.regionNames) : null}
              onOpenRace={() => {
                openMyRace();
                setMobileTab("races");
              }}
            />
          ) : null}
          <div
            style={
              sideBySide
                ? {
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 7fr) minmax(380px, 5fr)",
                    gap: 24,
                    alignItems: "start",
                  }
                : { display: "flex", flexDirection: "column", gap: 18 }
            }
          >
            {!loading && filter && (isDesktop || mobileTab === "races") ? (
              <CampaignMap
                countryId={props.countryId}
                countryName={props.countryName}
                regionNoun={props.regionNoun}
                races={races}
                filter={filter}
                selectedRace={selected}
                onSelectRegion={selectRegion}
                onCanvass={() => actions.setCampaignAction("canvass")}
                turn={currentTurn}
              />
            ) : null}
            {!loading && (isDesktop || mobileTab === "races") ? (
              <RaceView
                countryId={props.countryId}
                regionNames={props.regionNames}
                race={selected}
                full={detail.full}
                wire={detail.wire}
                watched={selected ? watched.has(selected.key) : false}
                onToggleWatch={() => selected && toggleWatch(selected.key)}
                selectedCandidateId={candidateId}
                onSelectCandidate={pickCandidate}
                compact={!isDesktop}
              />
            ) : null}
          </div>
        </section>
      </BlendShell>
      {!isDesktop && sheetOpen && candidate ? (
        <BottomSheet title={candidate.name} onClose={() => setSheetOpen(false)}>
          <TargetPanel
            race={selected}
            candidate={candidate}
            onActed={refreshAfterAction}
            onShowMyMoves={() => {
              setSheetOpen(false);
              setMobileTab("self");
            }}
          />
        </BottomSheet>
      ) : null}
      {actions.character ? (
        <CampaignActionModal
          action={actions.campaignAction}
          character={actions.character}
          onClose={() => actions.setCampaignAction(null)}
          onResourcesSpent={actions.fetchCharacter}
        />
      ) : null}
    </div>
  );
}
