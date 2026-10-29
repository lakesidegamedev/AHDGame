"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import type { Crisis, CrisisInteraction, CrisisDecisionNode } from "@/lib/db/types/crisis";
// The one severity calculation, shared with the crises list and detail pages.
// This card used to carry a private copy that summed only per-turn `tick`
// magnitudes — precisely the calculation `severity.ts` was written to replace,
// because it ignores one-off GDP and margin shocks entirely. The two surfaces
// disagreed about 16 of the 32 crises running on the live world: both active
// recessions read HIGH here and MEDIUM on /world/crises, and every Civil
// Defense Fever read LOW here and MEDIUM there.
import { crisisSeverity } from "@/lib/crises/severity";
import { formatCrisisEffectValue } from "@/lib/crises/effectLabels";
import { apiErrorText } from "@/lib/errors/catalog";
import { EventItem, type EventTone } from "./EventsPanel";

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
    border: "border-rose-500/40",
    tone: "rose",
    badge: "bg-rose-500/10 text-rose-400",
    label: "High severity",
  },
  medium: {
    border: "border-amber-500/40",
    tone: "amber",
    badge: "bg-amber-500/10 text-amber-400",
    label: "Medium severity",
  },
  low: {
    border: "border-zinc-400/30",
    tone: "zinc",
    badge: "bg-zinc-400/10 text-zinc-400",
    label: "Low severity",
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

  const handleDismiss = useCallback((crisisId: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(crisisId);
      writeDismissedIds(next);
      return next;
    });
  }, []);

  const visibleCrises = crises.filter((c) => !dismissedIds.has(c.crisis._id.toString()));

  // No skeleton: the Events panel stays hidden until a source has something to show.
  if (loading) return null;

  if (visibleCrises.length === 0) return null;

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
        } = data;
        const severity = crisisSeverity(crisis);
        const styles = SEVERITY_STYLES[severity];

        return (
          <EventItem
            key={crisis._id.toString()}
            kind="crisis"
            status={canInteract && currentNode ? "decision" : "active"}
            tone={styles.tone}
            className={styles.border}
            title={crisis.name}
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
              <button
                type="button"
                onClick={() => handleDismiss(crisis._id.toString())}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-card-elevated hover:text-foreground"
                title="Dismiss from actions"
                aria-label="Dismiss crisis from Actions"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            }
          >
            <p className="text-body-sm text-muted">{crisis.description}</p>

            {/* Effects */}
            {crisis.effects.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {crisis.effects.slice(0, 3).map((effect, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-body-sm font-medium ${
                      effect.value < 0 ? "bg-error/10 text-error" : "bg-success/10 text-success"
                    }`}
                  >
                    {effect.effectType === "tick" && (
                      <svg
                        className="h-2.5 w-2.5 shrink-0 opacity-70"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                    )}
                    {effect.value > 0 ? "+" : ""}
                    {formatCrisisEffectValue(effect.value)} {effect.label}
                  </span>
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
                        ${interaction.collectiveCurrent.toLocaleString("en-US")} / $
                        {interaction.collectiveTarget?.toLocaleString("en-US")}
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
                                Contribute ${option.collectiveContribution.toLocaleString("en-US")}
                              </div>
                            )}
                            {option.effects.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {option.effects.map((effect, i) => (
                                  <span
                                    key={i}
                                    className={`text-xs px-1.5 py-0.5 rounded border ${
                                      effect.value < 0
                                        ? "border-error/20 bg-error/5 text-error"
                                        : "border-success/20 bg-success/5 text-success"
                                    }`}
                                  >
                                    {effect.value > 0 ? "+" : ""}
                                    {effect.value} {effect.label}
                                  </span>
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
    </>
  );
}
