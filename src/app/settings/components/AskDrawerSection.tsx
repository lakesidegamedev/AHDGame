"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuthMe } from "@/contexts/AuthDataContext";
import { useToast } from "@/contexts/ToastContext";

type DrawerSide = "left" | "right";

// Which edge of the page the Ask Keir drawer docks to. The drawer itself is on
// for every signed-in player; the preference is saved with the account.
export function AskDrawerSection() {
  const t = useTranslations("settings");
  const { user, refetch } = useAuthMe();
  const { showToast } = useToast();
  const [side, setSide] = useState<DrawerSide>(user?.askDrawerSide === "left" ? "left" : "right");
  const [saving, setSaving] = useState(false);

  const pickSide = async (next: DrawerSide) => {
    if (next === side) return;
    const previous = side;
    setSide(next);
    setSaving(true);
    try {
      const response = await fetch("/api/settings/experimental-features", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ askDrawerSide: next }),
      });
      if (!response.ok) throw new Error(String(response.status));
      refetch();
    } catch {
      setSide(previous);
      showToast(t("askDrawer.saveError"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-card-border bg-background/50 px-4 py-3">
      <div>
        <div className="text-sm font-medium text-foreground">{t("askDrawer.title")}</div>
        <p className="mt-1 text-xs text-muted">{t("askDrawer.body")}</p>
      </div>
      <div className="flex items-center gap-3">
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
