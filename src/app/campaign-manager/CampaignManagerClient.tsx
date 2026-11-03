"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BlendShell } from "@/components/blend/BlendShell";
import { BLEND, FONT } from "@/components/blend/tokens";
import {
  adjacentCycles,
  canonicalRaceKey,
  defaultFinishedYear,
  resolveSelectedRace,
  type CmRace,
  type RaceFilter,
  type SeatCycle,
} from "@/lib/campaignManager/rules";
import type { CmLinkFilter } from "@/lib/campaignManager/links";
import { openingFilter } from "@/lib/campaignManager/openingFilter";
import { fetchJson } from "@/lib/observability/fetchJson";
import type { ElectionResponse } from "@/lib/elections/electionResponseTypes";
import { useRaceIndex } from "./useRaceIndex";
import { useFinishedCount, useFinishedRaces } from "./useFinishedRaces";
import { useSeatHistory } from "./useSeatHistory";
import { SeatNav } from "./components/SeatNav";
import { PastRaces } from "./components/PastRaces";
import { RaceEntryButtons } from "./components/RaceEntryButtons";
import { RaceAdmin } from "./components/RaceAdmin";
import { CountryPicker } from "./components/CountryPicker";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import {
  needsConstituencyPicker,
  useRaceEntry,
} from "@/components/elections/raceEntry/useRaceEntry";
import { BgFoundingConstituencyPicker } from "@/components/elections/raceEntry/BgFoundingConstituencyPicker";
import { Hu1991ConstituencyPicker } from "@/components/elections/raceEntry/Hu1991ConstituencyPicker";
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
  /** Filter params from a deep link, already validated. */
  initialFilter?: Partial<CmLinkFilter>;
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
  const actions = useActionsController({ viewMode: "compact", enabled: !!props.characterId });
  // The player's own favorability and influence move with every My moves action;
  // read them from the live character so the race table and Target card follow
  // without refetching every election in the country.
  const liveFav = actions.character?.favorability;
  const liveInfl = actions.character?.politicalInfluence;
  // Finished races join the index only on the Finished stage (opening a past
  // race or a link to one switches there), reloaded each turn; the stage's
  // count comes from a one-row count. The type is the chosen one, else the
  // one the page opens on.
  const openingRace =
    indexedRaces.find((r) => r.key === canonicalRaceKey(indexedRaces, pickedKey, watched)) ??
    indexedRaces.find((r) => r.isMine) ??
    indexedRaces[0];
  const shownType =
    chosenFilter?.type ?? props.initialFilter?.type ?? openingRace?.electionType ?? "";
  const finished = useFinishedRaces(
    props.countryId,
    shownType,
    (chosenFilter?.stage ?? props.initialFilter?.stage) === "final",
    props.nationalChamberKeys,
    currentTurn ?? 0
  );
  const finishedCount = useFinishedCount(props.countryId, shownType, currentTurn ?? 0);
  const allRaces = useMemo(
    () => (finished.races.length > 0 ? [...indexedRaces, ...finished.races] : indexedRaces),
    [indexedRaces, finished.races]
  );
  const races = useMemo(
    () =>
      liveFav == null && liveInfl == null
        ? allRaces
        : allRaces.map((r) =>
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
    [allRaces, liveFav, liveInfl]
  );

  // The player's race now: a finished race or primary is history, not theirs to run.
  // Links name races by election id; a race in its primary has a row per party.
  const raceKey = useMemo(
    () => canonicalRaceKey(races, pickedKey, watched),
    [races, pickedKey, watched]
  );

  const myRace = useMemo(() => races.find((r) => r.isMine && r.stage !== "final"), [races]);
  // Until the player chooses, the page opens on the linked race, else their own
  // race, else the first race type in the country, nationwide.
  const filter = useMemo<RaceFilter | null>(() => {
    if (chosenFilter) {
      // Finished always shows one year: the chosen one while the type has
      // races then, else its newest (a type switch lands on a real year).
      const year =
        chosenFilter.stage === "final"
          ? defaultFinishedYear(races, chosenFilter.type, chosenFilter.year)
          : chosenFilter.year;
      return { ...chosenFilter, year, regionNames: props.regionNames };
    }
    const opening = openingFilter(races, raceKey, props.initialFilter ?? {});
    if (!opening) return null;
    const year =
      opening.stage === "final"
        ? defaultFinishedYear(races, opening.type, opening.year)
        : opening.year;
    return { ...opening, year, regionNames: props.regionNames };
  }, [chosenFilter, races, raceKey, props.initialFilter, props.regionNames]);

  // A link to a finished race the live index does not hold: look the race up
  // once and open Finished at its type, year and region. A race that is not
  // this country's finished down-ballot race is ignored (the page opens as if
  // unlinked).
  const lookedUp = useRef(false);
  useEffect(() => {
    if (loading || chosenFilter || !pickedKey || lookedUp.current) return;
    if (races.some((r) => r.key === raceKey)) return;
    lookedUp.current = true;
    const electionId = pickedKey.split(":")[0];
    fetchJson<{ election?: ElectionResponse }>(
      `/api/elections?id=${encodeURIComponent(electionId)}&view=summary`,
      { feature: "campaign-manager-link" }
    )
      .then(({ election: e }) => {
        if (!e?.isEnded || e.electionType === "president" || e.countryId !== props.countryId) {
          return;
        }
        setChosenFilter({
          type: e.electionType,
          stage: "final",
          year: e.electionYear ?? e.resolvedYear,
          regionId: e.state,
          query: "",
        });
      })
      .catch((err: unknown) => console.warn("Campaign Manager: linked race unavailable", err));
  }, [loading, chosenFilter, pickedKey, raceKey, races, props.countryId]);

  // A race the filter no longer shows (another type, stage or region) gives
  // way to the region's own race, so the panel and the map agree with the filter.
  const selected: CmRace | null = filter
    ? resolveSelectedRace(races, raceKey, filter, watched)
    : null;
  // A completed turn changes `currentTurn`, an action bumps `detailVersion`:
  // either re-reads the selected race's polling and wire.
  const detail = useRaceDetail(
    selected?.electionId ?? null,
    detailVersion * 100_000 + (currentTurn ?? 0)
  );

  // The seat's other cycles: live and upcoming ones are in the index, finished
  // ones load with the Finished stage that opening them switches to.
  const seat = useSeatHistory(selected?.electionId ?? null, currentTurn ?? 0);
  const cycleNav = useMemo(
    () =>
      selected ? adjacentCycles(seat.cycles, selected.electionId) : { prev: null, next: null },
    [selected, seat.cycles]
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

  // Opening another cycle of the seat: a finished one switches the finder to
  // Finished at that year; a live one back to every live race. A primary row
  // opens that party's primary.
  const openCycle = useCallback(
    (c: SeatCycle, partyId?: string) => {
      if (!selected) return;
      setChosenFilter({
        type: c.electionType ?? selected.electionType,
        stage: c.state === "final" ? "final" : "all",
        ...(c.state === "final" ? { year: c.year } : {}),
        regionId: selected.regionId,
        query: "",
      });
      setPickedKey(partyId ? `${c.electionId}:${partyId}` : c.electionId);
      setCandidateId(null);
    },
    [selected]
  );

  const refreshAfterAction = useCallback(() => {
    reload();
    setDetailVersion((v) => v + 1);
    void actions.fetchCharacter();
  }, [reload, actions]);

  // Enter / withdraw for the selected live race, through the election page's
  // own flow. A finished race (or a finished primary) offers neither.
  const { confirm, dialog: confirmNode } = useConfirmDialog();
  const [constituencyId, setConstituencyId] = useState("");
  const entryElection =
    selected && selected.stage !== "final" && detail.full?.id === selected.electionId
      ? detail.full
      : null;
  // Endorsing works in a live general, for a player with a character.
  const endorse =
    selected?.stage === "general" && detail.full?.id === selected.electionId && detail.full.myCharId
      ? { endorsedId: detail.full.myEndorsedCandidateId, onChanged: refreshAfterAction }
      : null;
  const entry = useRaceEntry(entryElection, {
    confirm,
    constituencyId,
    onDone: refreshAfterAction,
  });

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
      if (!isDesktop && props.characterId) setSheetOpen(true);
    },
    [isDesktop, props.characterId]
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
  const readOnlyNotice = <p style={{ padding: 16 }}>{t("readOnly")}</p>;
  const right = !props.characterId ? (
    readOnlyNotice
  ) : (
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
            endorse={endorse}
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
              finishedCount={finishedCount}
              countryPicker={<CountryPicker countryId={props.countryId} />}
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
              countryPicker={<CountryPicker countryId={props.countryId} />}
            />
          ) : null}
          {!isDesktop && mobileTab === "self" && !props.characterId ? readOnlyNotice : null}
          {!isDesktop && mobileTab === "self" && props.characterId ? (
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
                onCanvass={
                  props.characterId ? () => actions.setCampaignAction("canvass") : undefined
                }
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
                nav={<SeatNav prev={cycleNav.prev} next={cycleNav.next} onOpen={openCycle} />}
                entry={
                  <>
                    <RaceEntryButtons
                      canEnter={entry.canEnter}
                      canWithdraw={entry.canWithdraw}
                      busy={entry.busy}
                      onEnter={() => void entry.enter()}
                      onWithdraw={() => void entry.withdraw()}
                    />
                    {entry.canEnter && entryElection && needsConstituencyPicker(entryElection) ? (
                      entryElection.hungarianAssemblyRound?.round === 1 ? (
                        <Hu1991ConstituencyPicker
                          allowedDistrictIds={
                            entryElection.hungarianAssemblyRound.vacancyDistrictIds
                          }
                          regionId={entryElection.state}
                          value={constituencyId}
                          onChange={setConstituencyId}
                        />
                      ) : (
                        <BgFoundingConstituencyPicker
                          allowedDistrictIds={
                            entryElection.bulgarianFoundingRound?.newNominationDistrictIds
                          }
                          regionId={entryElection.state}
                          value={constituencyId}
                          onChange={setConstituencyId}
                        />
                      )
                    ) : null}
                  </>
                }
                admin={
                  selected && detail.full?.id === selected.electionId ? (
                    <RaceAdmin
                      electionId={selected.electionId}
                      isAdmin={detail.full.isAdmin}
                      inPrimary={detail.full.inPrimary}
                      isEnded={detail.full.isEnded}
                      candidates={detail.full.candidates.map((c) => ({
                        id: c.id,
                        name: c.characterName,
                      }))}
                      onDone={refreshAfterAction}
                    />
                  ) : null
                }
                history={
                  <PastRaces
                    cycles={seat.cycles}
                    currentId={selected?.electionId ?? null}
                    onOpen={openCycle}
                  />
                }
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
            endorse={endorse}
            onShowMyMoves={() => {
              setSheetOpen(false);
              setMobileTab("self");
            }}
          />
        </BottomSheet>
      ) : null}
      {confirmNode}
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
