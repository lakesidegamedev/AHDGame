"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  subscribeToCharacterSwitch,
  type CharacterSwitchMessage,
} from "@/lib/characterSwitchSignal";

/** Shown in a tab that was open when another tab switched the active character. */
export function CharacterSwitchBanner() {
  const t = useTranslations("nav.characterSwitch");
  const [switched, setSwitched] = useState<CharacterSwitchMessage | null>(null);

  useEffect(() => subscribeToCharacterSwitch(setSwitched), []);

  if (!switched) return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-3 border-b border-warning/40 bg-card px-4 py-2 text-sm text-foreground shadow-lg"
      data-testid="character-switch-banner"
    >
      <span>{switched.name ? t("messageNamed", { name: switched.name }) : t("message")}</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1 font-semibold text-primary hover:bg-primary/20"
      >
        {t("reload")}
      </button>
    </div>
  );
}
