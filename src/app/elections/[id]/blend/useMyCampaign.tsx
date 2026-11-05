"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiErrorText } from "@/lib/errors/catalog";
import { fetchJson } from "@/lib/observability/fetchJson";
import { formatStatePresenceCost, statePresenceNextCost } from "@/lib/campaigns/statePresenceCost";
import { BLEND, BLEND_LABEL, FONT } from "@/components/blend/tokens";
import { campaignPageHref } from "@/lib/campaignManager/links";
import { presenceLevelsFor, type RacePresenceEntry } from "@/lib/campaignManager/mapActions";
import { useFieldOfficeMapControl } from "./presMap/fieldOfficeMapContext";

interface PresenceRow {
  stateId: string;
  level: number;
  nextCost: number;
  builtThisTurn?: boolean;
}

export interface MyCampaign {
  campaignId: string | null;
  /** The race, for the link into the campaign's field offices. */
  race: { id: string; countryId: string };
  color: string;
  /** Campaign Presence level per state. */
  levels: Record<string, number>;
  rows: Record<string, PresenceRow>;
  canBuild: boolean;
  /** The viewer may open field offices for this campaign (manager or nominee). */
  canOpenFieldOffice: boolean;
  busy: string | null;
  error: string | null;
  build: (stateId: string) => Promise<void>;
}

/**
 * The reader's own presidential campaign, for the map: Campaign Presence by
 * state and, for the candidate, the action to build it, from the same routes
 * the Political Operations tab uses. A manager or the running mate sees the
 * ticket's levels (presence is public in the race-wide list) but building it
 * stays the candidate's, as the build route enforces. Null when the reader is
 * not on a campaign in this race.
 */
export function useMyCampaign(args: {
  enabled: boolean;
  campaignId: string | null;
  race: { id: string; countryId: string };
  color: string;
  /** The ticket whose presence is shown; for the candidate this is the reader. */
  candidateId?: string | null;
  /** The reader is the candidate. Only the candidate's own list is theirs to build. */
  viewerIsCandidate?: boolean;
  /** The reader may open field offices for the campaign. */
  canOpenFieldOffice?: boolean;
}): MyCampaign | null {
  const {
    enabled,
    campaignId,
    race,
    color,
    candidateId = null,
    viewerIsCandidate = true,
    canOpenFieldOffice = true,
  } = args;
  const [rows, setRows] = useState<Record<string, PresenceRow>>({});
  const [canBuild, setCanBuild] = useState(false);
  const [fxRate, setFxRate] = useState<number>(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetchJson<{
      canBuild?: boolean;
      fxRate?: number;
      states?: PresenceRow[];
      racePresence?: RacePresenceEntry[];
    }>("/api/political-operations/state-org/list", {
      signal: controller.signal,
      feature: "presidential-map-presence",
    })
      .then((body) => {
        if (viewerIsCandidate) {
          setCanBuild(Boolean(body.canBuild));
          if (typeof body.fxRate === "number") setFxRate(body.fxRate);
          setRows(Object.fromEntries((body.states ?? []).map((r) => [r.stateId, r])));
          return;
        }
        // Someone else's ticket: the list's own rows are the reader's character,
        // not the campaign's. The race-wide list carries the ticket's levels.
        setCanBuild(false);
        const levels = presenceLevelsFor(body.racePresence, candidateId);
        setRows(
          Object.fromEntries(
            Object.entries(levels).map(([stateId, level]) => [
              stateId,
              { stateId, level, nextCost: 0 },
            ])
          )
        );
      })
      .catch((err: unknown) => {
        // fetchJson reports the failure; the map just shows no presence layer.
        if ((err as { name?: string }).name !== "AbortError")
          setError("Could not load your campaign.");
      });
    return () => controller.abort();
  }, [enabled, viewerIsCandidate, candidateId]);

  const build = useCallback(
    async (stateId: string) => {
      setBusy(stateId);
      setError(null);
      try {
        const res = await fetch("/api/political-operations/state-org/build", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stateId }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(apiErrorText(body, "Build failed"));
          return;
        }
        setRows((cur) => ({
          ...cur,
          [stateId]: {
            stateId,
            level: body.level,
            builtThisTurn: true,
            nextCost: statePresenceNextCost(body.level, fxRate),
          },
        }));
      } catch {
        setError("Network error. Try again.");
      } finally {
        setBusy(null);
      }
    },
    [fxRate]
  );

  if (!enabled) return null;
  return {
    campaignId,
    race,
    color,
    levels: Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, r.level])),
    rows,
    canBuild,
    canOpenFieldOffice,
    busy,
    error,
    build,
  };
}

/** "Your campaign here": presence in this state, building it, and a field office. */
export function MyCampaignStateBlock({ mine, stateId }: { mine: MyCampaign; stateId: string }) {
  const row = mine.rows[stateId];
  const level = row?.level ?? 0;
  // On the race page's map the link flies into the state's counties instead of
  // leaving for the field tab. A phone has no room for both, so it gets the
  // list of counties under this block and no link.
  const mapControl = useFieldOfficeMapControl();
  const linkStyle = {
    marginTop: 10,
    display: "block",
    fontSize: 13,
    color: BLEND.accentInk,
    textDecoration: "none",
  } as const;
  return (
    <section
      style={{
        marginTop: 16,
        padding: 12,
        border: `1px solid ${BLEND.hairlineStrong}`,
        background: BLEND.inset,
      }}
    >
      <div style={BLEND_LABEL}>Your campaign here</div>
      <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 22, fontWeight: 600, color: mine.color }}>
          {level}
        </span>
        <span style={{ fontSize: 12.5, color: BLEND.muted }}>Campaign Presence level</span>
      </div>
      {mine.canBuild && row ? (
        <button
          type="button"
          disabled={mine.busy === stateId || row.builtThisTurn}
          onClick={() => void mine.build(stateId)}
          style={{
            marginTop: 10,
            width: "100%",
            padding: "8px 10px",
            cursor: mine.busy === stateId || row.builtThisTurn ? "not-allowed" : "pointer",
            font: "inherit",
            fontSize: 13,
            fontWeight: 600,
            color: "#fff",
            background: BLEND.accent,
            border: "none",
            opacity: row.builtThisTurn ? 0.5 : 1,
          }}
        >
          {mine.busy === stateId
            ? "Building..."
            : row.builtThisTurn
              ? "Built this turn"
              : `Build presence to level ${level + 1} (${formatStatePresenceCost(row.nextCost)})`}
        </button>
      ) : null}
      {mine.error ? (
        <p role="alert" style={{ margin: "8px 0 0", fontSize: 12.5, color: BLEND.negative }}>
          {mine.error}
        </p>
      ) : null}
      {mine.campaignId && mine.canOpenFieldOffice ? (
        mapControl ? (
          mapControl.canZoom ? (
            <button
              type="button"
              onClick={() => mapControl.showFieldOffices(stateId)}
              className="hover:underline"
              style={{ ...linkStyle, padding: 0, border: 0, background: "none", cursor: "pointer" }}
            >
              Open a field office in this state
            </button>
          ) : null
        ) : (
          <Link
            href={campaignPageHref({
              campaignId: mine.campaignId,
              electionId: mine.race.id,
              countryId: mine.race.countryId,
              tab: "field",
              region: stateId,
            })}
            className="hover:underline"
            style={linkStyle}
          >
            Open a field office in this state
          </Link>
        )
      ) : null}
    </section>
  );
}
