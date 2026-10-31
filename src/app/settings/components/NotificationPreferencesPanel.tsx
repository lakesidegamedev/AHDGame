"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/db/types/notifications";
import { LocalTime } from "@/components/time/LocalTime";
import { categoryOf, type InboxCategory } from "@/lib/inbox/categories";
import { deliveryOf } from "@/lib/inbox/delivery";
import { SettingsSwitch } from "./SettingsSwitch";

const GROUP_ORDER: InboxCategory[] = [
  "crisis",
  "legislation",
  "election",
  "party",
  "standing",
  "treasury",
  "system",
];

interface Preferences {
  muteMail?: boolean;
  mutedTypes: NotificationType[];
  snoozedTypes: { type: NotificationType; until: string }[];
}

export function NotificationPreferencesPanel() {
  const t = useTranslations("settings.notifications");
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loadingError, setLoadingError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<"saving" | "saved" | "saveError" | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoadingError(false);
    void fetch("/api/notifications/preferences", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("preferences unavailable");
        const data: Preferences = await response.json();
        if (!controller.signal.aborted) setPreferences(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadingError(true);
      });
    return () => controller.abort();
  }, [attempt]);

  const update = async (type: NotificationType, action: "mute" | "unmute" | "unsnooze") => {
    if (!preferences || saving) return;
    const previous = preferences;
    setSaving(true);
    setMessage("saving");
    setPreferences({
      ...preferences,
      mutedTypes:
        action === "mute"
          ? [...preferences.mutedTypes, type]
          : action === "unmute"
            ? preferences.mutedTypes.filter((value) => value !== type)
            : preferences.mutedTypes,
      snoozedTypes:
        action === "unmute"
          ? preferences.snoozedTypes
          : preferences.snoozedTypes.filter((value) => value.type !== type),
    });
    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, action }),
      });
      if (!response.ok) throw new Error("preference rejected");
      setPreferences(await response.json());
      setMessage("saved");
    } catch {
      setPreferences(previous);
      setMessage("saveError");
    } finally {
      setSaving(false);
    }
  };

  const updateMail = async (enabled: boolean) => {
    if (!preferences || saving) return;
    const previous = preferences;
    setSaving(true);
    setMessage("saving");
    setPreferences({ ...preferences, muteMail: !enabled });
    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mail", muted: !enabled }),
      });
      if (!response.ok) throw new Error("preference rejected");
      setPreferences(await response.json());
      setMessage("saved");
    } catch {
      setPreferences(previous);
      setMessage("saveError");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-card-border bg-background/45 p-4 md:col-span-3 md:p-5">
      <h3 className="text-sm font-semibold">{t("title")}</h3>
      <p className="mt-1 text-xs leading-5 text-muted">{t("description")}</p>
      {loadingError ? (
        <p role="alert">
          {t("loadError")}{" "}
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            {t("retry")}
          </button>
        </p>
      ) : !preferences ? (
        <p role="status">{t("loading")}</p>
      ) : (
        <>
          <div className="my-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm">{t("mail")}</p>
              <p className="text-xs text-muted">{t("mailHint")}</p>
            </div>
            <SettingsSwitch
              label={t("mail")}
              checked={!preferences.muteMail}
              disabled={saving}
              onChange={(enabled) => void updateMail(enabled)}
            />
          </div>
          <input
            aria-label={t("search")}
            placeholder={t("search")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="my-3 w-full rounded-lg border border-card-border bg-card p-3 text-sm"
          />
          <div className="max-h-[28rem] overflow-y-auto pr-1">
            {(() => {
              const query = search.trim().toLowerCase();
              const visible = NOTIFICATION_TYPES.filter((type) =>
                t(`types.${type}`).toLowerCase().includes(query)
              );
              if (visible.length === 0)
                return <p className="py-3 text-sm text-muted">{t("noMatch")}</p>;
              // Grouped like the inbox chips so a player can find "elections"
              // without reading 140 rows, with the alerts that also reach the
              // phone marked.
              return GROUP_ORDER.map((group) => {
                const rows = visible.filter((type) => categoryOf(type) === group);
                if (rows.length === 0) return null;
                return (
                  <section key={group} aria-labelledby={`notification-group-${group}`}>
                    <h4
                      id={`notification-group-${group}`}
                      className="sticky top-0 z-10 bg-background/95 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted"
                    >
                      {t(`groups.${group}`)}
                    </h4>
                    <div className="grid gap-x-6 md:grid-cols-2">
                      {rows.map((type) => {
                        const snooze = preferences.snoozedTypes.find(
                          (entry) => entry.type === type && Date.parse(entry.until) > Date.now()
                        );
                        return (
                          <div
                            key={type}
                            className="flex items-center justify-between gap-3 border-b border-card-border py-2"
                          >
                            <div>
                              <p className="text-sm">{t(`types.${type}`)}</p>
                              {deliveryOf(type) === "push" && (
                                <p className="text-xs text-primary">{t("pushTag")}</p>
                              )}
                              {snooze && (
                                <>
                                  <p className="text-xs text-muted">
                                    {t.rich("snoozed", {
                                      time: () => <LocalTime value={snooze.until} />,
                                    })}
                                  </p>
                                  <button
                                    type="button"
                                    disabled={saving}
                                    className="text-xs text-primary"
                                    onClick={() => void update(type, "unsnooze")}
                                  >
                                    {t("resume", { name: t(`types.${type}`) })}
                                  </button>
                                </>
                              )}
                            </div>
                            <SettingsSwitch
                              label={t(`types.${type}`)}
                              checked={!preferences.mutedTypes.includes(type)}
                              disabled={saving}
                              onChange={(enabled) => void update(type, enabled ? "unmute" : "mute")}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              });
            })()}
          </div>
          <p className="mt-2 text-xs" role="status">
            {message ? t(message) : ""}
          </p>
        </>
      )}
    </section>
  );
}
