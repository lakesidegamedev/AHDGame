"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BLEND, FONT } from "@/components/blend/tokens";
import { useToast } from "@/contexts/ToastContext";
import { apiErrorText } from "@/lib/errors/catalog";

/**
 * Endorse a candidate in a general, or withdraw the endorsement already given:
 * the election page's endorse action, against the same route and with the
 * same toasts. One endorsement per race; endorsing someone else moves it.
 */
export function EndorseControl({
  electionId,
  candidateId,
  endorsedId,
  onChanged,
}: {
  electionId: string;
  candidateId: string;
  endorsedId: string | null;
  onChanged: () => void;
}) {
  const t = useTranslations("elections.campaignManager.target");
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const endorsed = endorsedId === candidateId;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = endorsed
        ? await fetch(`/api/elections/${electionId}/endorse`, { method: "DELETE" })
        : await fetch(`/api/elections/${electionId}/endorse`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ candidateId }),
          });
      if (res.ok) {
        showToast(
          endorsed ? "Endorsement withdrawn" : "Endorsement recorded",
          endorsed ? "info" : "success"
        );
        onChanged();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(
          apiErrorText(
            data,
            endorsed ? "Failed to withdraw endorsement" : "Failed to endorse candidate"
          ),
          "error"
        );
      }
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        style={{
          minHeight: 34,
          padding: "0 12px",
          borderRadius: 8,
          cursor: busy ? "default" : "pointer",
          fontFamily: FONT.sans,
          fontSize: 13,
          fontWeight: 600,
          background: "transparent",
          color: BLEND.ink,
          border: `1px solid ${BLEND.hairlineStrong}`,
          opacity: busy ? 0.6 : 1,
        }}
      >
        {endorsed ? t("unendorse") : t("endorse")}
      </button>
      {endorsed ? (
        <span style={{ fontSize: 12.5, color: BLEND.muted }}>{t("endorsed")}</span>
      ) : null}
    </div>
  );
}
