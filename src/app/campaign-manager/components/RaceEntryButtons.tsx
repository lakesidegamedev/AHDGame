"use client";

import { useTranslations } from "next-intl";
import { BLEND, FONT } from "@/components/blend/tokens";

const BUTTON = {
  minHeight: 32,
  padding: "0 12px",
  borderRadius: 8,
  fontFamily: FONT.sans,
  fontSize: 13,
  fontWeight: 600,
} as const;

/** Enter race / Withdraw for the selected race, as the shared entry rules allow. */
export function RaceEntryButtons({
  canEnter,
  canWithdraw,
  busy,
  onEnter,
  onWithdraw,
}: {
  canEnter: boolean;
  canWithdraw: boolean;
  busy: boolean;
  onEnter: () => void;
  onWithdraw: () => void;
}) {
  const t = useTranslations("elections.campaignManager.race");
  if (!canEnter && !canWithdraw) return null;
  return (
    <>
      {canEnter ? (
        <button
          type="button"
          onClick={onEnter}
          disabled={busy}
          aria-label={t("enterRace")}
          style={{
            ...BUTTON,
            cursor: busy ? "default" : "pointer",
            border: 0,
            background: BLEND.accent,
            color: "#fff",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? t("working") : t("enterRace")}
        </button>
      ) : null}
      {canWithdraw ? (
        <button
          type="button"
          onClick={onWithdraw}
          disabled={busy}
          aria-label={t("withdraw")}
          style={{
            ...BUTTON,
            cursor: busy ? "default" : "pointer",
            background: "transparent",
            color: BLEND.negative,
            border: `1px solid ${BLEND.negative}`,
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? t("working") : t("withdraw")}
        </button>
      ) : null}
    </>
  );
}
