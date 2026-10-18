"use client";

import { useEffect, useState } from "react";
import type { CorpOperatorAction, CorpOperatorPermission } from "@/lib/db/types/corporation";
import { OPERATOR_ACTIONS } from "@/lib/turn/npp/rules/operatorPolicy";
import {
  matchOperatorPreset,
  OPERATOR_PRESETS,
  type OperatorAttitude,
} from "@/lib/turn/npp/rules/operatorPresets";
import { DenseSection, InlineStatus, KVRow, SmallButton } from "../dense/DenseKit";

type Actions = Partial<Record<CorpOperatorAction, CorpOperatorPermission>>;

interface PolicyView {
  policy: { actions?: Actions } | null;
  effective: {
    role: "autopilot" | "caretaker" | "npp";
    actions: Record<CorpOperatorAction, CorpOperatorPermission>;
  };
}

const ACTION_LABEL: Record<CorpOperatorAction, string> = {
  found: "Open new plants",
  grow: "Grow plants",
  divest: "Sell or close plants",
  retool: "Retool plants",
  borrow: "Borrow",
  budgets: "Set budgets",
  dividends: "Set dividends",
  research: "Pick research",
};

const PERMISSION_LABEL: Record<CorpOperatorPermission, string> = {
  allow: "Allowed",
  ask: "Tell me",
  never: "Never",
};

/** Actions where "Tell me" reaches the owner as an advisory. */
const ADVISABLE: ReadonlySet<CorpOperatorAction> = new Set(["divest", "research"]);

/**
 * What the NPP running this corporation may do. Pick an attitude for a one-click
 * setting, or set each action yourself. Selling or closing a plant removes it
 * with no sale proceeds, so that one asks for a confirmation before it is allowed.
 */
export function OperatorPolicyCard({ corpId }: { corpId: string }) {
  const [view, setView] = useState<PolicyView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDivest, setConfirmDivest] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/corporations/${corpId}/operator-policy`)
      .then((res) => (res.ok ? (res.json() as Promise<PolicyView>) : null))
      .then((data) => {
        if (!cancelled && data) setView(data);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load these settings.");
      });
    return () => {
      cancelled = true;
    };
  }, [corpId]);

  async function save(actions: Actions) {
    setBusy(true);
    setError("");
    try {
      const empty = Object.keys(actions).length === 0;
      const res = await fetch(`/api/corporations/${corpId}/operator-policy`, {
        method: empty ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: empty ? undefined : JSON.stringify({ actions }),
      });
      const data = (await res.json()) as PolicyView & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      setView(data);
      setConfirmDivest(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  if (!view) return error ? <InlineStatus message={error} tone="error" /> : null;

  const stored = view.policy?.actions ?? {};
  const attitude: OperatorAttitude | null = matchOperatorPreset(stored);

  function setAction(action: CorpOperatorAction, permission: CorpOperatorPermission) {
    if (
      action === "divest" &&
      permission === "allow" &&
      view?.effective.actions.divest !== "allow"
    ) {
      setConfirmDivest(true);
      return;
    }
    void save({ ...stored, [action]: permission });
  }

  return (
    <DenseSection id="operator-policy" title="What the NPP may do" meta={attitude ?? "Custom"}>
      <div className="space-y-2 py-1">
        <p className="text-xs text-muted">
          Choose how the NPP running this corporation behaves, or set each action yourself.
        </p>
        <div className="flex flex-wrap gap-2">
          {OPERATOR_PRESETS.map((preset) => (
            <SmallButton
              key={preset.id}
              tone={attitude === preset.id ? "primary" : "default"}
              disabled={busy}
              onClick={() => void save(preset.actions)}
            >
              {preset.label}
            </SmallButton>
          ))}
        </div>
        {attitude && (
          <p className="text-xs text-muted">
            {OPERATOR_PRESETS.find((preset) => preset.id === attitude)?.blurb}
          </p>
        )}
        <div className="divide-y divide-card-border border-y border-card-border">
          {OPERATOR_ACTIONS.map((action) => {
            const current = view.effective.actions[action];
            return (
              <KVRow
                key={action}
                label={ACTION_LABEL[action]}
                mono={false}
                value={
                  <select
                    aria-label={ACTION_LABEL[action]}
                    className="rounded border border-card-border bg-transparent px-1 py-0.5 text-xs"
                    value={current}
                    disabled={busy}
                    onChange={(e) => setAction(action, e.target.value as CorpOperatorPermission)}
                  >
                    {(["allow", "ask", "never"] as const)
                      .filter((p) => p !== "ask" || ADVISABLE.has(action))
                      .map((p) => (
                        <option key={p} value={p}>
                          {PERMISSION_LABEL[p]}
                        </option>
                      ))}
                  </select>
                }
              />
            );
          })}
        </div>
        {confirmDivest && (
          <div className="space-y-2 border-y border-card-border py-2" role="alert">
            <p className="text-sm font-medium">Allow the NPP to sell or close plants?</p>
            <p className="text-xs text-muted">
              A plant it sells or closes is removed and you receive nothing for it. Money spent
              building it is lost. Only allow this if you accept that.
            </p>
            <div className="flex gap-2">
              <SmallButton
                tone="primary"
                disabled={busy}
                onClick={() => void save({ ...stored, divest: "allow" })}
              >
                Allow it
              </SmallButton>
              <SmallButton disabled={busy} onClick={() => setConfirmDivest(false)}>
                Cancel
              </SmallButton>
            </div>
          </div>
        )}
        <InlineStatus message={error} tone="error" />
      </div>
    </DenseSection>
  );
}
