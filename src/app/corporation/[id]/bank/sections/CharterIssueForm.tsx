"use client";

import { useReducer } from "react";
import { apiErrorText } from "@/lib/errors/catalog";
import { formatBankMoney } from "@/components/banking/formatBankMoney";
import type { BankCharterType } from "@/lib/db/types/bank";
import type { ConsolePayload, ShowToast } from "../types";
import { charterLabel, mergeState } from "../lib/helpers";
import { SmallButton } from "@/components/corporation/dense/DenseKit";
import { BankPanel } from "../components/BankSection";

export function CharterIssueForm({
  data,
  canMutate,
  onChanged,
  showToast,
}: {
  data: ConsolePayload;
  canMutate: boolean;
  onChanged: () => Promise<void>;
  showToast: ShowToast;
}) {
  const defaultType =
    data.eligibleTypes[0] ?? data.legalCharterTypes[0] ?? ("retail" as BankCharterType);
  const [{ type, busy }, updateCharterState] = useReducer(
    mergeState<{ type: BankCharterType; busy: boolean }>,
    { type: defaultType, busy: false }
  );

  const issue = async () => {
    updateCharterState({ busy: true });
    try {
      const res = await fetch(`/api/corporations/${data.corporation.id}/bank/charter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, currency: data.currency }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        reasons?: string[];
      };
      if (!res.ok) {
        showToast(
          json.reasons?.join("; ") ?? apiErrorText(json, "Could not issue charter"),
          "error"
        );
        return;
      }
      showToast("Bank charter issued", "success");
      await onChanged();
    } finally {
      updateCharterState({ busy: false });
    }
  };

  const types = data.eligibleTypes;
  if (!canMutate) return null;
  if (types.length === 0) return <CharterUnavailableNotice data={data} />;

  return (
    <BankPanel kind="ceoControl" title="Issue bank charter" className="max-w-2xl">
      <div className="space-y-3 py-1.5">
        <p className="text-body-sm text-muted">
          Posts{" "}
          <span className="font-mono text-foreground">
            {formatBankMoney(
              data.capitalRequirementByType?.[type] ?? data.capitalRequirement,
              data.currency
            )}
          </span>{" "}
          from the corporation treasury. Legal types follow this nation&apos;s banking separation
          law.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-body-sm text-muted">
            Charter type
            <select
              className="h-8 min-w-48 rounded-md border border-card-border bg-background px-2 text-body-sm text-foreground focus:border-foreground focus:outline-none"
              value={type}
              onChange={(e) => updateCharterState({ type: e.target.value as BankCharterType })}
              disabled={!canMutate}
              aria-label="Charter type"
            >
              {types.map((t) => (
                <option key={t} value={t} disabled={!data.eligibleTypes.includes(t) && canMutate}>
                  {charterLabel(t)}
                  {!data.eligibleTypes.includes(t) ? " (not eligible)" : ""}
                </option>
              ))}
            </select>
          </label>
          {canMutate && (
            <SmallButton tone="primary" onClick={() => void issue()} disabled={busy}>
              {busy ? "Issuing..." : "Issue charter"}
            </SmallButton>
          )}
        </div>
        <p className="text-body-sm text-muted">
          Treasury{" "}
          <span className="font-mono text-foreground">
            {formatBankMoney(data.corporation.liquidCapital, data.currency)}
          </span>
          , currency {data.currency}
        </p>
      </div>
    </BankPanel>
  );
}

/** Shown to a CEO with no charter when no charter type can be issued right now. */
function CharterUnavailableNotice({ data }: { data: ConsolePayload }) {
  const treasury = formatBankMoney(data.corporation.liquidCapital, data.currency);
  const types = data.legalCharterTypes;
  return (
    <BankPanel kind="ceoControl" title="Bank charter" className="max-w-2xl">
      <div className="space-y-3 py-1.5">
        <p className="text-body-sm text-muted">
          This corporation has no bank charter, and none can be issued right now.
        </p>
        {data.eligibilityReasons.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 text-body-sm text-error">
            {data.eligibilityReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        {types.length === 0 ? (
          <p className="text-body-sm text-muted">
            No private bank charters are legal in this jurisdiction.
          </p>
        ) : (
          <ul className="space-y-0.5 text-body-sm" aria-label="Capital required per charter type">
            {types.map((t) => (
              <li key={t} className="flex justify-between gap-4">
                <span className="text-muted">{charterLabel(t)} charter capital</span>
                <span className="font-mono text-foreground">
                  {formatBankMoney(
                    data.capitalRequirementByType?.[t] ?? data.capitalRequirement,
                    data.currency
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-body-sm text-muted">
          Treasury <span className="font-mono text-foreground">{treasury}</span>, currency{" "}
          {data.currency}
        </p>
      </div>
    </BankPanel>
  );
}
