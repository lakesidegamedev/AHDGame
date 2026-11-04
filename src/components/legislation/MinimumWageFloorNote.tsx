"use client";

import { useTranslations } from "next-intl";

/**
 * States the plant wage floor a national minimum wage law option sets. The
 * legislation-types API only attaches `wageFloorKaitz` while
 * minimumWageLawStage is on, so nothing renders while it is off.
 */
export default function MinimumWageFloorNote({ kaitz }: { kaitz?: number | null }) {
  const t = useTranslations("legislation.minimumWageFloor");
  if (typeof kaitz !== "number") return null;
  return (
    <p className="text-xs text-muted">
      {kaitz > 0 ? t("sets", { percent: Math.round(kaitz * 100) }) : t("none")}
    </p>
  );
}
