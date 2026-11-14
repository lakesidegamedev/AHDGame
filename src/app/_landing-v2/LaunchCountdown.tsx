"use client";

/**
 * Doors open and first turn, above the hero headline of a world that has not
 * started yet. Each row names the time in Eastern and counts down to it; a row
 * drops out once its time passes, and the block once both have.
 *
 * The time of day is rendered on the server (fixed time zone, so it hydrates
 * the same), and the ticking remainder only after mount, with a placeholder of
 * the same width so nothing moves when it arrives.
 */
import { useLocale, useTranslations } from "next-intl";
import type { LaunchSchedule } from "@/lib/landing/rules/launchSchedule";
import { useCountdownTo, type CountdownParts } from "./useCountdownTo";

const EASTERN = "America/New_York";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** `01d 23:10:05`, or dashes before the first client tick. */
export function formatRemaining(parts: CountdownParts | null): string {
  if (!parts) return "--d --:--:--";
  return `${pad(parts.days)}d ${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`;
}

/**
 * The time in Eastern for the reader's locale. Server and browser ICU differ
 * in the spaces they emit (a narrow no-break space before "PM" in newer
 * builds), which breaks hydration, so every space is normalized.
 */
export function formatEastern(at: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: EASTERN,
  })
    .format(new Date(at))
    .replace(/\s/g, " ");
}

function Row({ label, at, locale }: { label: string; at: string; locale: string }) {
  const t = useTranslations("auth");
  const remaining = useCountdownTo(at);
  const when = formatEastern(at, locale);
  return (
    // Phones: label and clock on one line, the time under them. Wider: one row.
    <div className="flex flex-wrap items-baseline gap-x-5">
      <dt className="text-[#ff4d5e] sm:w-[6.25rem]">{label}</dt>
      <dd className="order-3 basis-full text-white/60 sm:order-2 sm:basis-auto">
        <time dateTime={at}>{t("landing.world2027.easternTime", { time: when })}</time>
      </dd>
      <dd className="order-2 ml-auto text-white tabular-nums sm:order-3 sm:ml-0" aria-hidden="true">
        {formatRemaining(remaining)}
      </dd>
    </div>
  );
}

export function LaunchCountdown({ schedule }: { schedule: LaunchSchedule | null | undefined }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  if (!schedule || (!schedule.opensAt && !schedule.firstTurnAt)) return null;
  const note =
    schedule.phase === "sealed"
      ? t("landing.world2027.sealedNote")
      : schedule.phase === "open"
        ? t("landing.world2027.openNote")
        : null;

  return (
    <div className="mb-6">
      <dl className="flex max-w-full flex-col gap-y-2 rounded-md border border-white/15 bg-black/40 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.12em] sm:inline-flex sm:gap-y-1.5 sm:text-xs">
        {schedule.opensAt && (
          <Row label={t("landing.world2027.opensLabel")} at={schedule.opensAt} locale={locale} />
        )}
        {schedule.firstTurnAt && (
          <Row
            label={t("landing.world2027.firstTurnLabel")}
            at={schedule.firstTurnAt}
            locale={locale}
          />
        )}
      </dl>
      {note && <p className="mt-2 text-xs text-white/55">{note}</p>}
    </div>
  );
}
