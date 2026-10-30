"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuthMe } from "@/contexts/AuthDataContext";
import { useToast } from "@/contexts/ToastContext";
import {
  desktopNavigationLayout,
  DESKTOP_NAVIGATION_LAYOUTS,
  type DesktopNavigationLayout,
} from "@/lib/navigation/desktopNavigationLayout";
import { useInterface } from "@/contexts/InterfaceContext";
import { captureProductEvent } from "@/lib/analytics/capture";
import { SettingsSwitch } from "./SettingsSwitch";

// Opt-in to experimental features. Off unless the player turns it on. The Ask
// Keir drawer graduated out of it; its side picker is under Appearance.
export function ExperimentalFeaturesSection() {
  const t = useTranslations("settings");
  const { user, refetch } = useAuthMe();
  const { mode: interfaceMode } = useInterface();
  const [layout, setLayout] = useState(() =>
    desktopNavigationLayout(user?.desktopNavigationLayout)
  );
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState<boolean>(user?.experimentalFeatures === true);
  const [saving, setSaving] = useState(false);

  async function save(
    patch: { experimentalFeatures?: boolean; desktopNavigationLayout?: DesktopNavigationLayout },
    undo: () => void
  ) {
    setSaving(true);
    try {
      const response = await fetch("/api/settings/experimental-features", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error(String(response.status));
      if (patch.desktopNavigationLayout)
        void captureProductEvent("desktop_navigation_layout_selected", {
          layout: patch.desktopNavigationLayout,
        });
      refetch();
    } catch {
      undo();
      showToast(t("experimental.saveError"), "error");
    } finally {
      setSaving(false);
    }
  }

  const toggle = (next: boolean) => {
    const previous = enabled;
    setEnabled(next);
    void save({ experimentalFeatures: next }, () => setEnabled(previous));
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t("experimental.intro")}</p>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-card-border bg-background/50 px-4 py-3">
        <div>
          <div className="text-sm font-medium text-foreground">{t("experimental.toggleLabel")}</div>
          <div className="text-xs text-muted">{t("experimental.toggleHint")}</div>
        </div>
        <SettingsSwitch
          checked={enabled}
          onChange={toggle}
          label={t("experimental.toggleLabel")}
          disabled={saving}
        />
      </div>
      {enabled && (
        <fieldset
          className="space-y-3 rounded-xl border border-card-border p-4"
          disabled={saving}
          aria-busy={saving}
        >
          <legend className="px-1 text-sm font-medium text-foreground">
            {t("experimental.desktopNavigation.title")}
          </legend>
          <p className="text-xs leading-relaxed text-muted">
            {t("experimental.desktopNavigation.hint")}
          </p>
          {interfaceMode === "classic" && (
            <p className="text-xs text-muted">{t("experimental.desktopNavigation.classicHint")}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {DESKTOP_NAVIGATION_LAYOUTS.map((option) => (
              <label
                key={option}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 focus-within:ring-2 focus-within:ring-primary ${layout === option ? "border-primary bg-primary/5" : "border-card-border hover:bg-card"} ${saving ? "cursor-wait opacity-60" : ""}`}
              >
                <input
                  type="radio"
                  name="desktop-navigation-layout"
                  value={option}
                  checked={layout === option}
                  className="mt-1 accent-primary"
                  onChange={() => {
                    const previous = layout;
                    setLayout(option);
                    void save({ desktopNavigationLayout: option }, () => setLayout(previous));
                  }}
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    {t(`experimental.desktopNavigation.options.${option}.title`)}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted">
                    {t(`experimental.desktopNavigation.options.${option}.hint`)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
