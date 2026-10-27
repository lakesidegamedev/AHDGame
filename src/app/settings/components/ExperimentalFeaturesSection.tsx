"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuthMe } from "@/contexts/AuthDataContext";
import { useToast } from "@/contexts/ToastContext";
import { SettingsSwitch } from "./SettingsSwitch";

type DrawerSide = "left" | "right";

// Opt-in to experimental features. Off unless the player turns it on; the Ask
// drawer is the first feature behind it.
export function ExperimentalFeaturesSection() {
  const t = useTranslations("settings");
  const { user, refetch } = useAuthMe();
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState<boolean>(user?.experimentalFeatures === true);
  const [side, setSide] = useState<DrawerSide>(user?.askDrawerSide === "left" ? "left" : "right");
  const [saving, setSaving] = useState(false);

  async function save(
    patch: { experimentalFeatures?: boolean; askDrawerSide?: DrawerSide },
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

  const pickSide = (next: DrawerSide) => {
    if (next === side) return;
    const previous = side;
    setSide(next);
    void save({ askDrawerSide: next }, () => setSide(previous));
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
      <div
        className={`space-y-3 rounded-xl border border-card-border bg-background/50 px-4 py-3 ${enabled ? "" : "opacity-60"}`}
      >
        <div>
          <div className="text-sm font-medium text-foreground">{t("experimental.askTitle")}</div>
          <p className="mt-1 text-xs text-muted">{t("experimental.askBody")}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">{t("experimental.sideLabel")}</span>
          <div className="inline-flex rounded-lg border border-card-border p-0.5" role="radiogroup">
            {(["left", "right"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={side === value}
                disabled={!enabled || saving}
                onClick={() => pickSide(value)}
                className={`rounded-md px-3 py-1 text-xs font-medium disabled:cursor-not-allowed ${side === value ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}
              >
                {value === "left" ? t("experimental.sideLeft") : t("experimental.sideRight")}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
