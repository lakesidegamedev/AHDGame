"use client";

import { useState } from "react";
import { apiErrorText } from "@/lib/errors/catalog";
import { ROLE_LABEL } from "@/lib/crises/v2/ledgerView";
import type { AidPledgeRange } from "@/lib/crises/levers/queries";
import type { CrisisV2Lever } from "@/lib/crises/queries/crisisV2View";
import { leverCooldownText, leverCostLines } from "./crisisV2Format";

interface Props {
  crisisId: string;
  levers: CrisisV2Lever[];
  corporations: Array<{ id: string; name: string }>;
  /** Called after a successful pull so the parent can refetch. */
  onPulled?: () => void;
}

type Pulled = "done" | "bill";

/**
 * Levers the viewer can pull now. A pull is two clicks (pull, then confirm),
 * disables itself while the request is in flight and shows the server's refusal
 * inline.
 */
export function CrisisLeverList({ crisisId, levers, corporations, onPulled }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [pulled, setPulled] = useState<Record<string, Pulled>>({});
  // A pulled lever leaves the server's list at once (it is on cooldown), so keep it
  // on screen to carry the confirmation.
  const [pulledLevers, setPulledLevers] = useState<CrisisV2Lever[]>([]);
  const [corporationId, setCorporationId] = useState<string>(corporations[0]?.id ?? "");
  const [pledgePct, setPledgePct] = useState<Record<string, number>>({});
  const [error, setError] = useState<{ leverId: string; message: string } | null>(null);

  const shown = [...levers, ...pulledLevers.filter((p) => !levers.some((l) => l.id === p.id))];
  if (shown.length === 0) return null;

  const pull = async (lever: CrisisV2Lever) => {
    setPending(lever.id);
    setError(null);
    try {
      const res = await fetch(`/api/crises/${crisisId}/levers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leverId: lever.id,
          ...(lever.needsCorporation ? { corporationId } : {}),
          ...(lever.aid ? { pctGdp: pledgePct[lever.id] ?? lever.aid.defaultPctGdp } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ leverId: lever.id, message: apiErrorText(data, "Could not pull this lever") });
        return;
      }
      setPulled((prev) => ({ ...prev, [lever.id]: data.billId ? "bill" : "done" }));
      setPulledLevers((prev) => [...prev.filter((p) => p.id !== lever.id), lever]);
      onPulled?.();
    } catch {
      setError({ leverId: lever.id, message: "Network error" });
    } finally {
      setPending(null);
      setConfirming(null);
    }
  };

  return (
    <ul className="space-y-2" aria-label="Responses you can make">
      {shown.map((lever) => {
        const costs = leverCostLines(lever.cost);
        const state = pulled[lever.id];
        const isPending = pending === lever.id;
        const noCompany = lever.needsCorporation && corporations.length === 0;
        return (
          <li
            key={lever.id}
            className="rounded-lg border border-card-border bg-background/40 p-2.5"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{lever.label}</div>
                <div className="text-xs text-muted">
                  As {ROLE_LABEL[lever.role].toLowerCase()}. Cuts severity by about{" "}
                  {Math.round(lever.mitigation)} per turn.
                </div>
              </div>
              {state ? (
                <span className="shrink-0 text-xs font-medium text-success">
                  {state === "bill" ? "Emergency bill raised" : "Pulled, counts next turn"}
                </span>
              ) : confirming === lever.id ? (
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => pull(lever)}
                    className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {isPending ? "Working" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => setConfirming(null)}
                    className="rounded-md border border-card-border px-2.5 py-1 text-xs text-muted hover:text-foreground disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={noCompany || pending !== null}
                  onClick={() => setConfirming(lever.id)}
                  className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {lever.viaBill ? "Raise bill" : "Pull"}
                </button>
              )}
            </div>
            <div className="mt-1 text-xs text-muted">
              {costs.length > 0 ? `Costs ${costs.join(", ")}.` : "No direct cost."}{" "}
              {leverCooldownText(lever.cooldownTurns)}.
            </div>
            {lever.needsCorporation &&
              (corporations.length === 0 ? (
                <p className="mt-1 text-xs text-warning">
                  You need to run a company in the affected country to use this.
                </p>
              ) : (
                corporations.length > 1 &&
                !state && (
                  <label className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                    Company
                    <select
                      value={corporationId}
                      onChange={(e) => setCorporationId(e.target.value)}
                      className="rounded border border-card-border bg-card px-1.5 py-0.5 text-foreground"
                    >
                      {corporations.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              ))}
            {lever.aid && !state && (
              <PledgeSize
                aid={lever.aid}
                value={pledgePct[lever.id] ?? lever.aid.defaultPctGdp}
                disabled={isPending}
                onChange={(pct) => setPledgePct((prev) => ({ ...prev, [lever.id]: pct }))}
              />
            )}
            {confirming === lever.id && !state && (
              <p className="mt-1 text-xs text-warning">
                Confirm to spend this now. It cannot be undone.
              </p>
            )}
            {error?.leverId === lever.id && (
              <p role="alert" className="mt-1 text-xs text-error">
                {error.message}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PledgeSize({
  aid,
  value,
  disabled,
  onChange,
}: {
  aid: AidPledgeRange;
  value: number;
  disabled: boolean;
  onChange: (pct: number) => void;
}) {
  const amount = Math.round(value * aid.senderGdp);
  return (
    <label className="mt-1 block text-xs text-muted">
      <span className="flex items-center justify-between">
        <span>Pledge size</span>
        <span className="tabular-nums font-medium text-foreground">
          {(value * 100).toFixed(2)}% of GDP, {aid.currencyCode} {amount.toLocaleString("en-US")}
        </span>
      </span>
      <input
        type="range"
        aria-label="Pledge size"
        min={aid.maxPctGdp / 100}
        max={aid.maxPctGdp}
        step={aid.maxPctGdp / 100}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </label>
  );
}
