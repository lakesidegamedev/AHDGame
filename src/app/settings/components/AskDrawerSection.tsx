"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuthMe } from "@/contexts/AuthDataContext";
import { useToast } from "@/contexts/ToastContext";
import { SettingsSwitch } from "./SettingsSwitch";

type DrawerSide = "left" | "right";

// Whether the Ask Keir drawer shows, and which edge of the page it docks to.
// On for every signed-in player unless they hide it; saved with the account.
export function AskDrawerSection() {
  const t = useTranslations("settings");
  const { user, refetch } = useAuthMe();
  const { showToast } = useToast();
  const [side, setSide] = useState<DrawerSide>(user?.askDrawerSide === "left" ? "left" : "right");
  const [shown, setShown] = useState(user?.askDrawerHidden !== true);
  const [saving, setSaving] = useState(false);

  const save = async (
    patch: { askDrawerSide?: DrawerSide; askDrawerHidden?: boolean },
    undo: () => void
  ) => {
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
      showToast(t("askDrawer.saveError"), "error");
    } finally {
      setSaving(false);
    }
  };

  const pickSide = async (next: DrawerSide) => {
    if (next === side) return;
    const previous = side;
    setSide(next);
    await save({ askDrawerSide: next }, () => setSide(previous));
  };

  const toggleShown = (next: boolean) => {
    setShown(next);
    void save({ askDrawerHidden: !next }, () => setShown(!next));
  };

  return (
    <div className="space-y-3 rounded-xl border border-card-border bg-background/50 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-foreground">{t("askDrawer.title")}</div>
          <p className="mt-1 text-xs text-muted">{t("askDrawer.body")}</p>
        </div>
        <SettingsSwitch
          checked={shown}
          onChange={toggleShown}
          label={t("askDrawer.showLabel")}
          disabled={saving}
        />
      </div>
      <div className={`flex items-center gap-3 ${shown ? "" : "hidden"}`}>
        <span className="text-xs text-muted">{t("askDrawer.sideLabel")}</span>
        <div className="inline-flex rounded-lg border border-card-border p-0.5" role="radiogroup">
          {(["left", "right"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={side === value}
              disabled={saving}
              onClick={() => void pickSide(value)}
              className={`rounded-md px-3 py-1 text-xs font-medium disabled:cursor-not-allowed ${side === value ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}
            >
              {value === "left" ? t("askDrawer.sideLeft") : t("askDrawer.sideRight")}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
