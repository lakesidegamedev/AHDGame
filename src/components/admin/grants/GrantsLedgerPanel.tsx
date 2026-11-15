"use client";

import { useCallback, useEffect, useState } from "react";
import { LocalTime } from "@/components/time/LocalTime";
import { apiErrorText } from "@/lib/errors/catalog";

interface GrantRow {
  id: string;
  at: string;
  kind: string;
  amount: number | null;
  currencyCode: string | null;
  item: string | null;
  reason: string;
  outcome: string;
  actor: { id: string | null; name: string | null; role: string | null };
  onBehalfOf: { tool: string; requestedBy: string; requestedByName: string | null } | null;
  recipients: Array<{ type: string; id?: string; name?: string }>;
  recipientCount: number;
}

const KINDS = ["actions", "funds", "cash", "voucher", "access", "credit", "treasury", "balance"];

function recipientText(row: GrantRow): string {
  if (row.recipients[0]?.type === "all_players") return "All players";
  const first = row.recipients[0];
  const label = first?.name ?? first?.id ?? "";
  return row.recipientCount > 1 ? `${label} and ${row.recipientCount - 1} more` : label;
}

function amountText(row: GrantRow): string {
  if (row.amount === null) return row.item ?? "";
  const sign = row.amount > 0 ? "+" : "";
  return `${sign}${row.amount.toLocaleString()}${row.currencyCode ? ` ${row.currencyCode}` : ""} ${row.kind}`;
}

export function GrantsLedgerPanel() {
  const [rows, setRows] = useState<GrantRow[]>([]);
  const [kind, setKind] = useState("");
  const [recipient, setRecipient] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (kind) params.set("kind", kind);
      if (recipient.trim()) params.set("recipient", recipient.trim());
      const res = await fetch(`/api/admin/grants?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(apiErrorText(data, "Could not load grants"));
        return;
      }
      setRows(data.grants);
    } catch {
      setError("Could not load grants");
    } finally {
      setLoading(false);
    }
  }, [kind, recipient]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Grants and adjustments</h2>
        <p className="text-sm text-muted">
          Every grant of money, actions, items or access, and who is accountable for it.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <select
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          aria-label="Kind"
          className="rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
        >
          <option value="">All kinds</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          placeholder="Recipient name or id"
          aria-label="Recipient"
          className="rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-card-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Done by</th>
              <th className="px-3 py-2">On whose request</th>
              <th className="px-3 py-2">Recipient</th>
              <th className="px-3 py-2">What</th>
              <th className="px-3 py-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-card-border align-top">
                <td className="px-3 py-2">
                  <LocalTime value={row.at} />
                </td>
                <td className="px-3 py-2">
                  {row.actor.name ?? row.actor.id}
                  {row.actor.role ? <span className="text-muted"> ({row.actor.role})</span> : null}
                </td>
                <td className="px-3 py-2">
                  {row.onBehalfOf
                    ? `${row.onBehalfOf.requestedByName ?? row.onBehalfOf.requestedBy} via ${row.onBehalfOf.tool}`
                    : "Self"}
                </td>
                <td className="px-3 py-2">{recipientText(row)}</td>
                <td className="px-3 py-2">
                  {amountText(row)}
                  {row.outcome === "error" ? <span className="text-error"> (failed)</span> : null}
                </td>
                <td className="px-3 py-2">{row.reason}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted">
                  No grants match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
