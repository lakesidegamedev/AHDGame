"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { subscribeToCharacterSwitch } from "@/lib/characterSwitchSignal";
import {
  getActiveCharacterMismatch,
  noteCharacterSwitchSignal,
  subscribeActiveCharacterMismatch,
} from "@/lib/activeCharacterGuard";

/**
 * Shown when the active character changed after this page rendered, whether the
 * switch came from another tab in this browser or from another browser or
 * device. The page body is made inert until reload so nothing is done as the
 * wrong character.
 */
export function CharacterSwitchBanner() {
  const t = useTranslations("nav.characterSwitch");
  const switched = useSyncExternalStore(
    subscribeActiveCharacterMismatch,
    getActiveCharacterMismatch,
    () => null
  );

  useEffect(() => subscribeToCharacterSwitch(noteCharacterSwitchSignal), []);

  useEffect(() => {
    if (!switched) return;
    const main = document.querySelector("main");
    if (!main) return;
    main.setAttribute("inert", "");
    main.setAttribute("aria-disabled", "true");
    return () => {
      main.removeAttribute("inert");
      main.removeAttribute("aria-disabled");
    };
  }, [switched]);

  if (!switched) return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-3 border-b border-warning/40 bg-card px-4 py-2 text-body text-foreground shadow-lg"
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
