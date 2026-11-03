"use client";

/**
 * Gear dropdown for the grouped-cards desktop navigation: settings, editing the
 * navigation, hiding Ask Keir, a quick theme picker and sign out.
 */

import React, { useState, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { useOptionalAuthMe, useRefetchNav } from "@/contexts/AuthDataContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useToast } from "@/contexts/ToastContext";
import { THEME_OPTIONS } from "@/lib/themes/themeOptions";
import { DropdownPanel, MenuLabel, MenuRow } from "./experimentalNavPrimitives";
import { PixelNavIcon } from "./PixelNavIcon";

interface Props {
  anchorRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  singleplayer: boolean;
  closeAll: () => void;
  onEditNavigation: () => void;
  onSignOut: () => void;
}

const rowClass =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-fg-2 transition-colors hover:bg-white/5 hover:text-foreground disabled:cursor-wait disabled:opacity-50";

export function NavSettingsMenu({
  anchorRef,
  panelRef,
  singleplayer,
  closeAll,
  onEditNavigation,
  onSignOut,
}: Props) {
  const t = useTranslations("nav");
  const auth = useOptionalAuthMe();
  const refetchNav = useRefetchNav();
  const { showToast } = useToast();
  const { theme, setTheme } = useTheme();
  const [keirHidden, setKeirHidden] = useState(auth?.user?.askDrawerHidden === true);
  const [savingKeir, setSavingKeir] = useState(false);

  const toggleKeir = async () => {
    const next = !keirHidden;
    setKeirHidden(next);
    setSavingKeir(true);
    try {
      const response = await fetch("/api/settings/experimental-features", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ askDrawerHidden: next }),
      });
      if (!response.ok) throw new Error(String(response.status));
      refetchNav();
    } catch {
      setKeirHidden(!next);
      showToast(t("settingsMenu.saveError"), "error");
    } finally {
      setSavingKeir(false);
    }
  };

  return (
    <DropdownPanel anchorRef={anchorRef} panelRef={panelRef} align="right" width="w-72">
      <MenuRow href="/settings" onNavigate={closeAll}>
        {t("common.settings")}
      </MenuRow>
      <button
        type="button"
        className={rowClass}
        onClick={() => {
          closeAll();
          onEditNavigation();
        }}
      >
        {t("settingsMenu.editNavigation")}
      </button>
      {!singleplayer && (
        <button
          type="button"
          role="switch"
          aria-checked={!keirHidden}
          disabled={savingKeir}
          className={rowClass}
          onClick={() => void toggleKeir()}
        >
          <span>{t("settingsMenu.askKeir")}</span>
          <span
            aria-hidden="true"
            className={`ml-auto flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${keirHidden ? "bg-card-border" : "bg-primary"}`}
          >
            <span
              className={`h-3 w-3 rounded-full bg-white transition-transform ${keirHidden ? "" : "translate-x-3"}`}
            />
          </span>
        </button>
      )}

      <div className="my-1 h-px bg-card-border" />
      <MenuLabel>{t("settingsMenu.theme")}</MenuLabel>
      <div className="grid grid-cols-6 gap-1.5 px-2.5 pb-2 pt-1" role="group">
        {THEME_OPTIONS.map((option) => {
          const name = t(`settingsMenu.themes.${option.value}`);
          const active = theme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              title={name}
              aria-label={name}
              aria-pressed={active}
              onClick={() => setTheme(option.value)}
              style={{
                background: option.bg,
                borderColor: active ? option.primary : option.border,
              }}
              className="flex h-8 items-center justify-center rounded-md border-2 transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: option.primary }} />
            </button>
          );
        })}
      </div>

      {!singleplayer && (
        <>
          <div className="my-1 h-px bg-card-border" />
          <button
            type="button"
            className={`${rowClass} !text-error`}
            onClick={() => {
              closeAll();
              onSignOut();
            }}
          >
            {t("common.signOut")}
          </button>
        </>
      )}
    </DropdownPanel>
  );
}

export function NavSettingsIcon() {
  return <PixelNavIcon name="gear" className="h-[17px] w-[17px]" />;
}
