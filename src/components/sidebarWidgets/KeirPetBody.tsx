"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { KeirSprite, type KeirMood } from "@/components/askDrawer/KeirSprite";
import type { AdviceTone, KeirPetWidgetData } from "@/lib/sidebarWidgets/keirPet";
import { BOND_LEVELS } from "@/lib/sidebarWidgets/keirPet";
import { refreshSidebarWidgets } from "./useSidebarWidgetData";

/** Keir dozes off when the page has been left alone this long. */
const DOZE_MS = 3 * 60_000;
const TONE_MOOD: Record<AdviceTone, KeirMood> = {
  warn: "concerned",
  nudge: "point",
  idea: "idea",
  chat: "humming",
};
const PAT_REACTIONS: KeirMood[] = ["happy", "laughing", "blush", "wink", "thumbs_up"];

type TimeOfDay = "morning" | "day" | "evening" | "night";

export function timeOfDay(hour: number): TimeOfDay {
  if (hour < 6) return "night";
  if (hour < 11) return "morning";
  if (hour < 18) return "day";
  if (hour < 22) return "evening";
  return "night";
}

const ROOM: Record<TimeOfDay, string> = {
  morning: "from-amber-300/20 via-card-elevated to-card",
  day: "from-sky-400/20 via-card-elevated to-card",
  evening: "from-orange-500/25 via-primary/10 to-card",
  night: "from-indigo-950/70 via-card-elevated to-card",
};

function PixelHeart({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 7 6"
      className={`h-3 w-3.5 ${filled ? "text-primary" : "text-card-border"}`}
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path d="M1 0h2v1h1V0h2v1h1v2H6v1H5v1H4v1H3V5H2V4H1V3H0V1h1z" />
    </svg>
  );
}

function minutesUntil(iso: string | null, now: number): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / 60_000));
}

export function KeirPetBody({
  data,
  compact,
  onNavigate,
}: {
  data: KeirPetWidgetData;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav.widgets.keirPet");
  const [pet, setPet] = useState(data);
  const [mood, setMood] = useState<KeirMood>("wave");
  const [play, setPlay] = useState(0);
  const [asleep, setAsleep] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  // Set on mount; zero until then so render stays pure.
  const lastActivity = useRef(0);
  const asleepRef = useRef(false);
  const toneTimer = useRef<number | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- a refreshed tip replaces local state */
  useEffect(() => setPet(data), [data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const react = useCallback((next: KeirMood) => {
    setMood(next);
    setPlay((value) => value + 1);
  }, []);

  // Wave hello, then show how he feels about today's tip.
  useEffect(() => {
    toneTimer.current = window.setTimeout(() => react(TONE_MOOD[data.advice.tone]), 1400);
    return () => {
      if (toneTimer.current) window.clearTimeout(toneTimer.current);
    };
  }, [data.advice.tone, react]);

  // Doze off at night or when the page is left alone; any activity wakes him.
  useEffect(() => {
    const touch = () => {
      lastActivity.current = Date.now();
    };
    touch();
    const tick = () => {
      const current = Date.now();
      setNow(current);
      const night = timeOfDay(new Date(current).getHours()) === "night";
      const idle = current - lastActivity.current > DOZE_MS;
      const wasAsleep = asleepRef.current;
      // At night he stays asleep until someone wakes him on purpose.
      const sleepy = night ? idle || wasAsleep : idle;
      if (sleepy === wasAsleep) return;
      asleepRef.current = sleepy;
      setAsleep(sleepy);
      react(sleepy ? "yawn" : "waking");
    };
    window.addEventListener("pointermove", touch, { passive: true });
    window.addEventListener("keydown", touch);
    const timer = window.setInterval(tick, 15_000);
    return () => {
      window.removeEventListener("pointermove", touch);
      window.removeEventListener("keydown", touch);
      window.clearInterval(timer);
    };
  }, [react]);

  const care = async (action: "tea" | "pat") => {
    lastActivity.current = Date.now();
    if (asleepRef.current) {
      asleepRef.current = false;
      setAsleep(false);
      react("waking");
      return;
    }
    if (action === "pat") react(PAT_REACTIONS[Math.floor(Math.random() * PAT_REACTIONS.length)]!);
    else react("tea_sip");
    // Pats always get a reaction; only ready ones count toward the bond.
    const ready = action === "tea" ? !pet.teaReadyAt : !pet.patReadyAt;
    if (!ready || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/sidebar-widgets/keir-pet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (response.ok) {
        const body = (await response.json()) as { pet: KeirPetWidgetData };
        const gainedHeart = body.pet.hearts > pet.hearts;
        setPet(body.pet);
        if (gainedHeart) window.setTimeout(() => react("celebrate"), 1200);
        refreshSidebarWidgets();
      }
    } finally {
      setBusy(false);
    }
  };

  const teaMinutes = minutesUntil(pet.teaReadyAt, now);
  const previousLevel = pet.hearts > 0 ? BOND_LEVELS[pet.hearts - 1]! : 0;
  const progress =
    pet.nextHeartAt === null
      ? 1
      : Math.min(1, (pet.bond - previousLevel) / (pet.nextHeartAt - previousLevel));
  const scene = asleep ? "night" : timeOfDay(new Date(now).getHours());

  return (
    <div className="space-y-2.5">
      <div
        className={`relative flex items-end gap-2 overflow-hidden rounded-lg border border-card-border bg-gradient-to-b ${ROOM[scene]} px-2 pt-2`}
      >
        {scene === "night" && (
          <span aria-hidden="true" className="absolute inset-0 opacity-60">
            <span className="absolute left-[12%] top-[18%] h-px w-px bg-white" />
            <span className="absolute left-[38%] top-[10%] h-px w-px bg-white" />
            <span className="absolute left-[70%] top-[22%] h-0.5 w-0.5 bg-white" />
            <span className="absolute left-[86%] top-[8%] h-px w-px bg-white" />
          </span>
        )}
        <button
          type="button"
          onClick={() => void care("pat")}
          aria-label={asleep ? t("wake") : t("pat")}
          title={asleep ? t("wake") : t("pat")}
          className="relative shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-primary"
        >
          <KeirSprite key={play} mood={asleep ? "sleeping" : mood} scale={compact ? 2 : 3} />
          {asleep && (
            <span
              aria-hidden="true"
              className="absolute -right-1 top-1 animate-pulse font-mono text-xs font-bold text-fg-2"
            >
              z Z
            </span>
          )}
        </button>
        <div className="relative mb-3 min-w-0 flex-1 rounded-lg rounded-bl-none border border-card-border bg-card/95 p-2 shadow-sm">
          <p className="text-xs font-semibold leading-snug text-foreground">{pet.advice.title}</p>
          {!compact && <p className="mt-1 text-[11px] leading-snug text-muted">{pet.advice.why}</p>}
          {pet.advice.link && (
            <Link
              href={pet.advice.link}
              onClick={onNavigate}
              className="mt-1.5 inline-block text-[11px] font-medium text-primary hover:underline"
            >
              {t("showMe")} ›
            </Link>
          )}
        </div>
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1.5 bg-card-border/60" />
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5" aria-label={t("hearts", { count: pet.hearts })}>
          {BOND_LEVELS.map((level, index) => (
            <PixelHeart key={level} filled={index < pet.hearts} />
          ))}
        </div>
        <div
          className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-card-border/60"
          role="progressbar"
          aria-label={t("bond")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <span
            className="block h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-[11px] text-muted">{t("streak", { days: pet.streak })}</span>
      </div>

      {!compact && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void care("pat")}
            className="rounded-md border border-card-border px-2 py-1.5 text-xs font-medium text-foreground hover:bg-white/5"
          >
            {asleep ? t("wake") : t("pat")}
          </button>
          <button
            type="button"
            onClick={() => void care("tea")}
            disabled={teaMinutes > 0 || busy}
            className="rounded-md border border-card-border px-2 py-1.5 text-xs font-medium text-foreground hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {teaMinutes > 0
              ? t("teaIn", {
                  time: teaMinutes >= 60 ? `${Math.ceil(teaMinutes / 60)}h` : `${teaMinutes}m`,
                })
              : t("tea")}
          </button>
        </div>
      )}
    </div>
  );
}
