"use client";

import { useTranslations } from "next-intl";
import { BLEND, FONT } from "@/components/blend/tokens";
import type { SeatCycle } from "@/lib/campaignManager/rules";

const STEP = {
  minHeight: 28,
  padding: "0 10px",
  borderRadius: 7,
  fontFamily: FONT.sans,
  fontSize: 12.5,
  fontWeight: 600,
  background: "transparent",
  border: `1px solid ${BLEND.hairlineStrong}`,
} as const;

/** Previous / Next arrows through the seat's cycles, labelled with each cycle's year. */
export function SeatNav({
  prev,
  next,
  onOpen,
}: {
  prev: SeatCycle | null;
  next: SeatCycle | null;
  onOpen: (c: SeatCycle) => void;
}) {
  const t = useTranslations("elections.campaignManager.history");
  const label = (c: SeatCycle) => (c.year != null ? String(c.year) : t("cycle", { n: c.cycle }));
  const step = (c: SeatCycle | null, dir: "previous" | "next") => (
    <button
      type="button"
      disabled={!c}
      onClick={() => c && onOpen(c)}
      aria-label={c ? t(dir === "previous" ? "previousTo" : "nextTo", { year: label(c) }) : t(dir)}
      style={{
        ...STEP,
        cursor: c ? "pointer" : "default",
        color: c ? BLEND.ink : BLEND.mutedDim,
        opacity: c ? 1 : 0.6,
      }}
    >
      {dir === "previous" ? `‹ ${c ? label(c) : t("previous")}` : `${c ? label(c) : t("next")} ›`}
    </button>
  );
  if (!prev && !next) return null;
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
      {step(prev, "previous")}
      {step(next, "next")}
    </div>
  );
}
