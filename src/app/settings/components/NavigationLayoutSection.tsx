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
import {
  mobileNavigationLayout,
  MOBILE_NAVIGATION_LAYOUTS,
  type MobileNavigationLayout,
} from "@/lib/navigation/mobileNavigationLayout";
import { useInterface } from "@/contexts/InterfaceContext";
import { captureProductEvent } from "@/lib/analytics/capture";

// Desktop and phone navigation layouts. Every player gets grouped cards and the
// bottom dock unless they pick the standard menus; the choice is saved with the account.
export function NavigationLayoutSection() {
  const t = useTranslations("settings");
  const { user, refetch } = useAuthMe();
  const { mode: interfaceMode } = useInterface();
  const { showToast } = useToast();
  const [layout, setLayout] = useState(() =>
    desktopNavigationLayout(user?.desktopNavigationLayout)
  );
  const [mobileLayout, setMobileLayout] = useState(() =>
    mobileNavigationLayout(user?.mobileNavigationLayout)
  );
  const [saving, setSaving] = useState(false);

  async function save(
    patch: {
      desktopNavigationLayout?: DesktopNavigationLayout;
      mobileNavigationLayout?: MobileNavigationLayout;
    },
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
      if (patch.mobileNavigationLayout)
        void captureProductEvent("mobile_navigation_layout_selected", {
          layout: patch.mobileNavigationLayout,
        });
      refetch();
    } catch {
      undo();
      showToast(t("navigationLayout.saveError"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <LayoutChoice
        name="desktop-navigation-layout"
        title={t("navigationLayout.desktop.title")}
        hint={t("navigationLayout.desktop.hint")}
        classicText={t("navigationLayout.desktop.classicHint")}
        optionText={(option) => ({
          title: t(`navigationLayout.desktop.options.${option}.title`),
          hint: t(`navigationLayout.desktop.options.${option}.hint`),
        })}
        options={DESKTOP_NAVIGATION_LAYOUTS}
        value={layout}
        saving={saving}
        classicHint={interfaceMode === "classic"}
        onChange={(option) => {
          const previous = layout;
          setLayout(option);
          void save({ desktopNavigationLayout: option }, () => setLayout(previous));
        }}
      />
      <LayoutChoice
        name="mobile-navigation-layout"
        title={t("navigationLayout.mobile.title")}
        hint={t("navigationLayout.mobile.hint")}
        classicText={t("navigationLayout.mobile.classicHint")}
        optionText={(option) => ({
          title: t(`navigationLayout.mobile.options.${option}.title`),
          hint: t(`navigationLayout.mobile.options.${option}.hint`),
        })}
        options={MOBILE_NAVIGATION_LAYOUTS}
        value={mobileLayout}
        saving={saving}
        classicHint={interfaceMode === "classic"}
        onChange={(option) => {
          const previous = mobileLayout;
          setMobileLayout(option);
          void save({ mobileNavigationLayout: option }, () => setMobileLayout(previous));
        }}
      />
    </div>
  );
}

function LayoutChoice<T extends string>({
  name,
  title,
  hint,
  classicText,
  optionText,
  options,
  value,
  saving,
  classicHint,
  onChange,
}: {
  name: string;
  title: string;
  hint: string;
  classicText: string;
  optionText: (option: T) => { title: string; hint: string };
  options: readonly T[];
  value: T;
  saving: boolean;
  classicHint: boolean;
  onChange: (option: T) => void;
}) {
  return (
    <fieldset
      className="space-y-3 rounded-xl border border-card-border p-4"
      disabled={saving}
      aria-busy={saving}
    >
      <legend className="px-1 text-sm font-medium text-foreground">{title}</legend>
      <p className="text-xs leading-relaxed text-muted">{hint}</p>
      {classicHint && <p className="text-xs text-muted">{classicText}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 focus-within:ring-2 focus-within:ring-primary ${value === option ? "border-primary bg-primary/5" : "border-card-border hover:bg-card"} ${saving ? "cursor-wait opacity-60" : ""}`}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              className="mt-1 accent-primary"
              onChange={() => onChange(option)}
            />
            <span>
              <span className="block text-sm font-medium text-foreground">
                {optionText(option).title}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted">
                {optionText(option).hint}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
