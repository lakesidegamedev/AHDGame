"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import type { Crisis, CrisisInteraction, CrisisDecisionNode } from "@/lib/db/types/crisis";
// The one severity calculation, shared with the crises list and detail pages.
// A private copy would drift and disagree across surfaces.
import { crisisImageUrl } from "@/lib/crises/crisisImages";
import { crisisKind } from "@/lib/crises/rules/boardView";
import {
  compareCrisisRows,
  crisisSection,
  crisisScoreFor,
  severityBandFromScore,
  SEVERITY_BAND_LABEL,
} from "@/lib/crises/rules/crisisRow";
import { STAGE_LABEL } from "@/lib/crises/v2/ledgerView";
import { CrisisEffectChip, CrisisThumb, SeverityTag } from "@/components/crises/CrisisRowParts";
import { CrisisCollapsedList, type CrisisListRow } from "./CrisisCollapsedList";
import { apiErrorText } from "@/lib/errors/catalog";
import { CrisisV2Strip } from "@/components/crises/CrisisV2Strip";
import type { CrisisV2Summary } from "@/lib/crises/queries/crisisV2View";
import { EventItem, type EventTone } from "./EventsPanel";
import { formatMoney } from "@/lib/ui/numbers";

interface ActiveCrisisData {
  crisis: Crisis;
  interaction: CrisisInteraction | null;
  currentNode: CrisisDecisionNode | null;
  canInteract: boolean;
  timeRemainingMinutes: number | null;
  hasContributed: boolean;
  /**
   * Per-option campaign eligibility for global-response crises, as the crisis
   * detail page receives it. Null for crises that carry no such requirements.
   */
  optionAvailability?: Record<string, { eligible: boolean; reasons: string[] }> | null;
  /** Stage, severity, forecast and the viewer's levers for Crisis v2 crises. */
  v2?: CrisisV2Summary | null;
}

/** Full cards shown above the folded list; any further respondable crisis joins the list. */
const MAX_SURFACED_CARDS = 2;

function canRespondNow(data: ActiveCrisisData): boolean {
  return (data.canInteract && !!data.currentNode) || (data.v2?.levers.length ?? 0) > 0;
}

function rowFor(
  data: ActiveCrisisData
): CrisisListRow & { section: ReturnType<typeof crisisSection>; startTurn: number } {
  const { crisis, v2 } = data;
  const score = v2?.severity ?? crisisScoreFor(crisis, undefined);
  return {
    id: crisis._id.toString(),
    title: crisis.name,
    image: crisisImageUrl(
      {
        name: crisis.name,
        templateKey: crisis.templateKey,
        kind: crisisKind(crisis),
      },
      320
    ),
    scope: crisis.scope,
    countryIds: crisis.countryIds,
    regionIds: crisis.regionIds,
    stage: v2 ? STAGE_LABEL[v2.stage] : "Ongoing",
    band: severityBandFromScore(score),
    score,
    canRespond: canRespondNow(data),
    section: crisisSection({ status: crisis.status, stage: v2?.stage }),
    startTurn: crisis.startTurn,
  };
}

function formatTimeRemaining(minutes: number): string {
  if (minutes <= 0) return "Expired";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// `border` tints the tile by severity; the rail and icon carry the stronger color.
const SEVERITY_STYLES: Record<
  string,
  { border: string; tone: EventTone; badge: string; label: string }
> = {
  high: {
    border: "border-error/40",
    tone: "rose",
    badge: "bg-error/10 text-error",
    label: SEVERITY_BAND_LABEL.high,
  },
  medium: {
    border: "border-amber-500/40",
    tone: "amber",
    badge: "bg-amber-500/10 text-amber-400",
    label: SEVERITY_BAND_LABEL.medium,
  },
  low: {
    border: "border-zinc-400/30",
    tone: "zinc",
    badge: "bg-zinc-400/10 text-zinc-400",
    label: SEVERITY_BAND_LABEL.low,
  },
};

const DISMISSED_CRISIS_IDS_KEY = "ahd:dismissedCrisisIds";

function readDismissedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_CRISIS_IDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return new Set(parsed.map((id) => String(id)));
  } catch {
    // Ignore corrupted storage
  }
  return new Set();
}

/** Drop stored dismissals for crises no longer on the feed, so the set stays bounded. */
function pruneDismissedIds(liveIds: Set<string>): void {
  const stored = readDismissedIds();
  const kept = new Set([...stored].filter((id) => liveIds.has(id)));
  if (kept.size !== stored.size) writeDismissedIds(kept);
}

function writeDismissedIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISSED_CRISIS_IDS_KEY, JSON.stringify([...ids]));
  } catch {
    // Ignore storage errors
  }
}

export default function CrisisActionCard() {
  const [crises, setCrises] = useState<ActiveCrisisData[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  // Keyed by crisis: one refusal must not print under every open crisis.
  const [error, setError] = useState<{ crisisId: string; message: string } | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [regionNames, setRegionNames] = useState<Record<string, string>>({});
  // Cards start as one row; the player opens the ones they want to read.
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const { showToast } = useToast();

  // Load dismissed crisis IDs from localStorage on mount.
  useEffect(() => {
    setDismissedIds(readDismissedIds());
  }, []);

  // The /active-for-character API gates on the feature flag server-side and
  // returns an empty list when crisis interactions are disabled, so the card
  // simply renders nothing in that case (see the `crises.length === 0` guard).
  const fetchCrises = useCallback(async () => {
    try {
      const res = await fetch("/api/crises/active-for-character");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      const next: ActiveCrisisData[] = data.crises ?? [];
      setCrises(next);
      setRegionNames(data.regionNames ?? {});
      // Forget dismissals for crises that have left the feed. Without this the
      // stored set only ever grows: a player who dismisses the ambient cards
      // each turn accumulates an id per crisis for the life of the browser
      // profile, and the entries are dead the moment the crisis resolves.
      pruneDismissedIds(new Set(next.map((c) => c.crisis._id.toString())));
    } catch {
      // Silent fail — crises are ambient, not critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCrises();
    const interval = setInterval(fetchCrises, 60_000); // Refresh every minute
    return () => clearInterval(interval);
  }, [fetchCrises]);

  const handleInteract = async (crisisId: string, optionId: string) => {
    setSubmitting(`${crisisId}:${optionId}`);
    setError(null);
    try {
      const res = await fetch(`/api/crises/${crisisId}/interact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError({ crisisId, message: apiErrorText(data, "Failed to submit decision") });
        return;
      }

      // Show toast for applied effects
      if (data.appliedEffects && data.appliedEffects.length > 0) {
        const effectSummary = data.appliedEffects
          .map(
            (e: { value: number; label: string }) =>
              `${e.value > 0 ? "+" : ""}${e.value} ${e.label}`
          )
          .join(", ");
        showToast(`Effects applied: ${effectSummary}`, "success");
      } else if (data.nextNode) {
        showToast("Decision submitted", "success");
      } else {
        showToast("Crisis resolved", "success");
        handleDismiss(crisisId);
      }

      // Refresh to show next node or resolved state
      await fetchCrises();
    } catch {
      setError({ crisisId, message: "Network error" });
    } finally {
      setSubmitting(null);
    }
  };

  const toggleOpen = useCallback((crisisId: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(crisisId)) next.add(crisisId);
      return next;
    });
  }, []);

  const handleDismiss = useCallback((crisisId: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(crisisId);
      writeDismissedIds(next);
      return next;
    });
  }, []);

  const ranked = crises
    .filter((c) => !dismissedIds.has(c.crisis._id.toString()))
    .map((data) => ({ data, row: rowFor(data) }))
    .sort((a, b) => compareCrisisRows({ ...a.row }, { ...b.row }));
  // Only crises this player can act on surface on their own; everything else
  // waits in the folded list.
  const surfaced = ranked.filter((r) => r.row.canRespond).slice(0, MAX_SURFACED_CARDS);
  const surfacedIds = new Set(surfaced.map((r) => r.row.id));
  const visibleCrises = surfaced.map((r) => r.data);
  const listRows = ranked.filter((r) => !surfacedIds.has(r.row.id)).map((r) => r.row);

  // No skeleton: the Events panel stays hidden until a source has something to show.
  if (loading) return null;

  if (ranked.length === 0) return null;

  return (
    <>
      {visibleCrises.map((data) => {
        const {
          crisis,
          interaction,
          currentNode,
          canInteract,
          timeRemainingMinutes,
          hasContributed,
          optionAvailability,
          v2,
        } = data;
        const severity = severityBandFromScore(v2?.severity ?? crisisScoreFor(crisis, undefined));
        const styles = SEVERITY_STYLES[severity];
        const crisisId = crisis._id.toString();
        const needsDecision = canInteract && !!currentNode;
        const image = crisisImageUrl(
          { name: crisis.name, templateKey: crisis.templateKey, kind: crisisKind(crisis) },
          960
        );

        if (!openIds.has(crisisId)) {
          return (
            <article
              key={crisisId}
              data-event-item="crisis"
              className={`order-1 overflow-hidden rounded-lg border bg-background/40 ${styles.border}`}
            >
              <button
                type="button"
                aria-expanded={false}
                onClick={() => toggleOpen(crisisId)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-card-elevated"
              >
                <CrisisThumb
                  src={crisisImageUrl(
                    {
                      name: crisis.name,
                      templateKey: crisis.templateKey,
                      kind: crisisKind(crisis),
                    },
                    320
                  )}
                  className="h-9 w-14"
                />
                <span className="min-w-0 flex-1 truncate text-body font-semibold text-foreground">
                  {crisis.name}
                </span>
                <SeverityTag band={severity} />
                {needsDecision && (
                  <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-body-xs font-semibold text-warning">
                    Your decision
                  </span>
                )}
                {needsDecision && timeRemainingMinutes !== null && timeRemainingMinutes > 0 && (
                  <span className="shrink-0 text-body-sm font-semibold text-warning tabular-nums">
                    {formatTimeRemaining(timeRemainingMinutes)} left
                  </span>
                )}
                <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              </button>
            </article>
          );
        }

        return (
          <EventItem
            key={crisis._id.toString()}
            kind="crisis"
            status={needsDecision ? "decision" : "active"}
            tone={styles.tone}
            className={styles.border}
            title={crisis.name}
            image={image}
            tags={
              <>
                <span
                  className={`rounded-full px-2 py-0.5 text-body-xs font-medium ${styles.badge}`}
                >
                  {crisis.scope === "global"
                    ? "Global"
                    : crisis.scope === "country"
                      ? "National"
                      : "Regional"}
                </span>
                <span className="text-body-xs text-muted">{styles.label}</span>
              </>
            }
            aside={
              <>
                <button
                  type="button"
                  aria-expanded
                  onClick={() => toggleOpen(crisisId)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-background/70 text-muted backdrop-blur-sm transition-colors hover:bg-card-elevated hover:text-foreground"
                  title="Collapse"
                  aria-label={`Collapse ${crisis.name}`}
                >
                  <ChevronUp className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => handleDismiss(crisis._id.toString())}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-background/70 text-muted backdrop-blur-sm transition-colors hover:bg-card-elevated hover:text-foreground"
                  title="Dismiss from actions"
                  aria-label="Dismiss crisis from Actions"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </>
            }
          >
            <p className="text-body-sm text-muted">{crisis.description}</p>

            {/* Effects */}
            {crisis.effects.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {crisis.effects.slice(0, 3).map((effect, i) => (
                  <CrisisEffectChip key={i} effect={effect} />
                ))}
                {crisis.effects.length > 3 && (
                  <Link
                    href={`/world/crises/${crisis._id.toString()}`}
                    className="inline-flex items-center rounded-md bg-card-elevated px-2 py-0.5 text-body-sm text-muted transition-colors hover:text-foreground"
                  >
                    +{crisis.effects.length - 3} more
                  </Link>
                )}
              </div>
            )}

            {v2 && (
              <CrisisV2Strip crisisId={crisis._id.toString()} v2={v2} onPulled={fetchCrises} />
            )}

            {/* Interaction Section — only when this character can act */}
            {canInteract && currentNode && (
              <div className="rounded-lg border border-card-border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="text-body font-semibold text-foreground">{currentNode.title}</h4>
                  {/* The countdown belongs to the decision, not to the crisis. On an
                      ambient card there is no prompt to run out, so a bare
                      "Expired" chip beside a crisis that is still very much
                      running would read as the crisis itself having lapsed. */}
                  {timeRemainingMinutes !== null && (
                    <span className="shrink-0 text-body-sm font-semibold text-warning tabular-nums">
                      {timeRemainingMinutes > 0
                        ? `${formatTimeRemaining(timeRemainingMinutes)} left`
                        : formatTimeRemaining(timeRemainingMinutes)}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 mb-3 text-body-sm text-muted">{currentNode.description}</p>

                {/* Collective Progress */}
                {currentNode.type === "collective" && interaction && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted">Response fund</span>
                      <span className="tabular-nums">
                        {formatMoney(interaction.collectiveCurrent)} /{" "}
                        {formatMoney(interaction.collectiveTarget ?? 0)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{
                          width: `${Math.min(100, (interaction.collectiveCurrent / (interaction.collectiveTarget ?? 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    {interaction.contributors.length > 0 && (
                      <p className="text-xs text-muted mt-1">
                        {interaction.contributors.length} contributor
                        {interaction.contributors.length === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                )}

                {/* Aid nodes need a share-of-GDP amount, which only the crisis
                    page's slider collects. Posting a bare optionId from here is
                    always refused, so send the player to the real flow. */}
                {currentNode.type === "aid" && (
                  <Link
                    href={`/world/crises/${crisis._id.toString()}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-card-border bg-card px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-card-elevated"
                  >
                    Open the crisis to send aid or decline
                  </Link>
                )}

                {/* Options */}
                {currentNode.type !== "aid" &&
                  currentNode.options &&
                  currentNode.options.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {currentNode.options.map((option) => {
                        const isSubmitting =
                          submitting === `${crisis._id.toString()}:${option.optionId}`;
                        // An option the nation cannot meet the campaign requirement
                        // for would be refused by the command path, so it is closed
                        // here with its reasons rather than offered and rejected.
                        const availability = optionAvailability?.[option.optionId];
                        const isDisabled =
                          isSubmitting ||
                          availability?.eligible === false ||
                          (currentNode.type === "collective" && hasContributed);

                        return (
                          <button
                            type="button"
                            key={option.optionId}
                            onClick={() => handleInteract(crisis._id.toString(), option.optionId)}
                            disabled={isDisabled}
                            className={`rounded-lg border border-card-border bg-background/40 p-3 text-left transition-colors hover:border-primary/50 hover:bg-card-elevated disabled:opacity-50 disabled:cursor-not-allowed ${
                              isSubmitting ? "animate-pulse" : ""
                            }`}
                          >
                            <div className="text-sm font-medium text-foreground">
                              {option.label}
                            </div>
                            <div className="text-xs text-muted mt-0.5">{option.description}</div>
                            {availability?.eligible === false && (
                              <ul className="mt-2 space-y-0.5 text-body-sm text-error">
                                {availability.reasons.map((reason) => (
                                  <li key={reason}>{reason}</li>
                                ))}
                              </ul>
                            )}
                            {option.collectiveContribution && (
                              <div className="text-xs text-primary mt-1">
                                Contribute {formatMoney(option.collectiveContribution)}
                              </div>
                            )}
                            {option.effects.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {option.effects.map((effect, i) => (
                                  <CrisisEffectChip key={i} effect={effect} />
                                ))}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
              </div>
            )}

            {error?.crisisId === crisis._id.toString() && (
              <p className="text-body-sm text-error">{error.message}</p>
            )}
          </EventItem>
        );
      })}
      <CrisisCollapsedList rows={listRows} regionNames={regionNames} alsoRespondable={0} />
    </>
  );
}
