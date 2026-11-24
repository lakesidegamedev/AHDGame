"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuthMe } from "@/contexts/AuthDataContext";
import { useToast } from "@/contexts/ToastContext";
import { SettingsSwitch } from "./SettingsSwitch";

// Opt-in to experimental features. Off unless the player turns it on. The Ask
// Keir drawer and the navigation layouts graduated out of it; their pickers are
// under Appearance.
export function ExperimentalFeaturesSection() {
  const t = useTranslations("settings");
  const { user, refetch } = useAuthMe();
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState<boolean>(user?.experimentalFeatures === true);
  const [saving, setSaving] = useState(false);

  async function save(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    setSaving(true);
    try {
      const response = await fetch("/api/settings/experimental-features", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experimentalFeatures: next }),
      });
      if (!response.ok) throw new Error(String(response.status));
      refetch();
    } catch {
      setEnabled(previous);
      showToast(t("experimental.saveError"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t("experimental.intro")}</p>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-card-border bg-background/50 px-4 py-3">
        <div>
          <div className="text-sm font-medium text-foreground">{t("experimental.toggleLabel")}</div>
          <div className="text-xs text-muted">
            {enabled ? t("experimental.toggleHintOn") : t("experimental.toggleHintOff")}
          </div>
        </div>
        <SettingsSwitch
          checked={enabled}
          onChange={(next) => void save(next)}
          label={t("experimental.toggleLabel")}
          disabled={saving}
        />
      </div>
    </div>
  );
}
