"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiErrorText } from "@/lib/errors/catalog";

interface SupplyPriorityPanelProps {
  corporationId: string;
  sectorId: string;
  sellOutsideFirst: boolean;
}

/** CEO switch: this sector sells to outside buyers before the company's own plants. */
export default function SupplyPriorityPanel({
  corporationId,
  sectorId,
  sellOutsideFirst,
}: SupplyPriorityPanelProps) {
  const t = useTranslations("corporations.sectorSupplyPriority");
  const [enabled, setEnabled] = useState(sellOutsideFirst);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setEnabled(sellOutsideFirst), [sellOutsideFirst]);

  const toggle = async () => {
    const next = !enabled;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/corporations/${corporationId}/sectors/${sectorId}/supply-priority`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sellOutsideFirst: next }),
        }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(apiErrorText(data, t("failed")));
      }
      setEnabled(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-border bg-surface p-4">
      <label className="flex items-start justify-between gap-3">
        <span>
          <span className="block text-sm font-semibold text-foreground">{t("label")}</span>
          <span className="mt-0.5 block text-xs text-muted">{t("help")}</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          disabled={saving}
          onChange={toggle}
          className="mt-1 h-4 w-4 shrink-0"
        />
      </label>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
