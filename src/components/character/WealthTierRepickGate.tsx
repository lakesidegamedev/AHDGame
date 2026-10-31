"use client";

import { useEffect, useState } from "react";
import { useAuthMe } from "@/contexts/AuthDataContext";
import { fetchJson } from "@/lib/observability/fetchJson";
import { Button } from "@/components/ui";
import { apiErrorText } from "@/lib/errors/catalog";
import { formatLocalAmountFull } from "@/lib/utils/formattersCore";
import type { WealthLevel } from "@/lib/constants/characterWealth";
import type { WealthTierOption } from "@/lib/character/wealthTierRepick";

interface WealthTierPayload {
  current?: WealthLevel;
  options?: WealthTierOption[];
}

/**
 * Global blocking gate shown once after an economy reset: the player picks the
 * wealth background their politician starts the new economy with. Their
 * current tier is preselected, so confirming without a change keeps it.
 */
export function WealthTierRepickGate() {
  const { user, refetch } = useAuthMe();
  const needs = !!user?.character?.needsWealthTierRepick;

  const [options, setOptions] = useState<WealthTierOption[]>([]);
  const [current, setCurrent] = useState<WealthLevel | null>(null);
  const [choice, setChoice] = useState<WealthLevel | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!needs) return;
    let active = true;
    fetchJson<WealthTierPayload>("/api/character/wealth-tier", {
      credentials: "same-origin",
      cache: "no-store",
      feature: "wealth-tier-repick",
    })
      .then((d) => {
        if (!active) return;
        setOptions(d?.options ?? []);
        setCurrent(d?.current ?? null);
        setChoice(d?.current ?? null);
      })
      .catch(() => {
        if (active) setError("Could not load the wealth options. Refresh to try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [needs]);

  if (!needs || done) return null;

  const submit = async () => {
    if (!choice || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/character/wealth-tier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wealth: choice }),
        credentials: "same-origin",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setDone(true);
          refetch(true);
          return;
        }
        throw new Error(apiErrorText(d, "Failed to save your choice. Please try again."));
      }
      setDone(true);
      refetch(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save your choice.");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto p-4 py-8"
      role="dialog"
      aria-modal
      aria-labelledby="wealth-tier-repick-title"
    >
      <div
        className="absolute inset-0 backdrop-blur-[2px]"
        style={{ background: "var(--modal-backdrop)" }}
      />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-card-border bg-card shadow-2xl">
        <div className="relative px-5 pt-5 pb-4">
          <h2 id="wealth-tier-repick-title" className="text-lg font-semibold text-foreground">
            Choose your starting wealth
          </h2>
          <p className="mt-1 text-xs text-muted">
            The economy has started fresh. Pick the wealth background your politician begins the new
            economy with. Your personal cash is set to the amount shown. You can make this choice
            once.
          </p>
        </div>

        <div className="px-5 pb-5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <>
              <div className="space-y-2" role="radiogroup" aria-label="Wealth background">
                {options.map((option) => {
                  const selected = choice === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setChoice(option.value)}
                      className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                        selected
                          ? "border-primary bg-primary/10"
                          : "border-card-border hover:border-primary/50"
                      }`}
                    >
                      <span className="text-sm font-medium text-foreground">
                        {option.label}
                        {current === option.value && (
                          <span className="ml-2 text-xs font-normal text-muted">(current)</span>
                        )}
                      </span>
                      <span className="text-sm tabular-nums text-foreground">
                        {formatLocalAmountFull(option.amount, option.currency)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {error && (
                <p className="mt-3 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-xs text-error">
                  {error}
                </p>
              )}

              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  variant="primary"
                  onClick={submit}
                  disabled={!choice}
                  isLoading={submitting}
                  className="min-w-[160px]"
                >
                  Confirm
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
