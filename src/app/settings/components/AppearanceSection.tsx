"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { fetchJson } from "@/lib/observability/fetchJson";
import { useTheme } from "@/contexts/ThemeContext";
import type { InterfaceMode } from "@/contexts/InterfaceContext";
import { type StatusBarLayout } from "@/components/StatusBar";
import { THEME_OPTIONS } from "@/lib/themes/themeOptions";
import { LanguageSection } from "./LanguageSection";
import {
  useCorpOverviewMode,
  type CorpOverviewMode,
} from "@/components/corporation/useCorpOverviewMode";

const CORP_OVERVIEW_MODES: readonly CorpOverviewMode[] = ["simple", "pro"];

const VISIBLE = 4;
const PAGES = Math.ceil(THEME_OPTIONS.length / VISIBLE);

interface Props {
  interfaceMode: InterfaceMode;
  interfaceModeSaving: boolean;
  onInterfaceModeChange: (value: InterfaceMode) => void;
}

export function AppearanceSection({
  interfaceMode,
  interfaceModeSaving,
  onInterfaceModeChange,
}: Props) {
  const t = useTranslations("settings");
  const { theme, setTheme } = useTheme();
  const { mode: corpOverviewMode, setMode: setCorpOverviewMode } = useCorpOverviewMode();
  const [page, setPage] = useState(0);
  const [statusBarLayout, setStatusBarLayout] = useState<StatusBarLayout>("standard");
  const trackRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- reading localStorage */
  useEffect(() => {
    const saved = localStorage.getItem("statusBarLayout");
    if (saved === "corp" || saved === "elections" || saved === "full" || saved === "minimal")
      setStatusBarLayout(saved);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Snap the carousel to the page containing the active theme on first render
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- reading active theme from context to derive initial page index */
  useEffect(() => {
    const idx = THEME_OPTIONS.findIndex((t) => t.value === theme);
    if (idx >= 0) setPage(Math.floor(idx / VISIBLE));
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  const updateTrack = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    const gap = 10;
    const slideW = (viewport.clientWidth - gap * (VISIBLE - 1)) / VISIBLE;
    const offset = page * VISIBLE * (slideW + gap);
    track.style.transform = `translateX(-${offset}px)`;
  }, [page]);

  useEffect(() => {
    updateTrack();
    window.addEventListener("resize", updateTrack);
    return () => window.removeEventListener("resize", updateTrack);
  }, [updateTrack]);

  const handleLayoutChange = (layout: StatusBarLayout) => {
    setStatusBarLayout(layout);
    localStorage.setItem("statusBarLayout", layout);
    window.dispatchEvent(new StorageEvent("storage", { key: "statusBarLayout", newValue: layout }));
    fetchJson("/api/settings/status-bar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout }),
      feature: "settings-status-bar-layout",
    }).catch(() => {});
  };

  const selectedTheme = THEME_OPTIONS.find((t) => t.value === theme);

  return (
    <>
      <p className="text-sm text-muted mb-5">{t("appearance.intro")}</p>

      {/* ── Carousel ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-card-border bg-card-muted p-4 mb-2">
        <div className="flex items-baseline justify-between mb-3">
          <span className="text-sm font-medium text-foreground">{t("appearance.themeLabel")}</span>
          <span className="text-xs text-muted">{t("appearance.themeMeta")}</span>
        </div>

        <div className="relative">
          {/* Prev */}
          <button
            type="button"
            aria-label={t("appearance.prevThemes")}
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 h-8 w-8 rounded-full border border-card-border bg-card flex items-center justify-center text-muted hover:border-primary/50 hover:text-foreground transition-all disabled:opacity-30 disabled:pointer-events-none"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          {/* Track */}
          <div ref={viewportRef} className="overflow-hidden">
            <div
              ref={trackRef}
              className="flex gap-2.5 transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)]"
            >
              {THEME_OPTIONS.map((opt) => {
                const isActive = theme === opt.value;
                const isLight = opt.value === "light" || opt.value === "pastel";
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setTheme(opt.value)}
                    style={{
                      flex: `0 0 calc((100% - ${(VISIBLE - 1) * 10}px) / ${VISIBLE})`,
                      background: opt.bg,
                      borderColor: isActive ? opt.primary : opt.border,
                    }}
                    className={`relative rounded-lg border p-2.5 text-left transition-all hover:-translate-y-0.5 ${
                      isActive
                        ? "shadow-[0_0_0_2px_color-mix(in_srgb,var(--primary)_30%,transparent)] ring-0"
                        : "hover:border-muted/50"
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className="text-[11px] font-semibold leading-none tracking-tight"
                        style={{
                          color: opt.fg,
                        }}
                      >
                        {t(`appearance.themes.${opt.value}`)}
                      </span>
                      {isActive && (
                        <span
                          className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold text-white"
                          style={{ background: opt.primary }}
                        >
                          ✓
                        </span>
                      )}
                    </div>

                    {/* Mini preview card */}
                    <div
                      className="flex items-center gap-1.5 rounded px-1.5 py-1 mb-1.5 border"
                      style={{ background: opt.card, borderColor: opt.border }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ background: opt.primary }}
                      />
                      <span
                        className="h-0.5 flex-1 rounded-full opacity-40"
                        style={{ background: opt.fg2 }}
                      />
                      <span
                        className="text-[9px] font-bold font-mono tabular-nums"
                        style={{ color: isLight ? opt.fg : opt.fg }}
                      >
                        58%
                      </span>
                    </div>

                    {/* Swatches */}
                    <div className="flex gap-0.5">
                      {[opt.primary, opt.secondary, opt.success, opt.warning, opt.error].map(
                        (color, i) => (
                          <span
                            key={i}
                            className="flex-1 h-1 rounded-[1px]"
                            style={{ background: color }}
                          />
                        )
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Next */}
          <button
            type="button"
            aria-label={t("appearance.nextThemes")}
            disabled={page === PAGES - 1}
            onClick={() => setPage((p) => Math.min(PAGES - 1, p + 1))}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 h-8 w-8 rounded-full border border-card-border bg-card flex items-center justify-center text-muted hover:border-primary/50 hover:text-foreground transition-all disabled:opacity-30 disabled:pointer-events-none"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>

        {/* Dots + status */}
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-muted font-mono">
            {t("appearance.selectedLabel")}{" "}
            <span className="text-foreground">
              {t(`appearance.themes.${selectedTheme?.value ?? "default"}`)}
            </span>
          </span>
          <div className="flex gap-1.5">
            {Array.from({ length: PAGES }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-label={t("appearance.pageAria", { number: i + 1 })}
                onClick={() => setPage(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === page ? "w-4 bg-primary" : "w-1.5 bg-card-border hover:bg-muted"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <LanguageSection />

      {/* ── Interface ───────────────────────────────────────────────────── */}
      <div className="border-t border-card-border pt-6">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-medium">{t("appearance.interfaceTitle")}</h3>
        </div>
        <fieldset
          className="grid gap-3 sm:grid-cols-2"
          aria-busy={interfaceModeSaving}
          aria-label={t("appearance.interfaceTitle")}
        >
          {(["modern", "classic"] as const).map((mode) => {
            const selected = interfaceMode === mode;
            return (
              <label
                key={mode}
                data-interface-option
                data-selected={selected ? "true" : undefined}
                className={`relative rounded-xl border px-4 py-3 text-left transition-all ${
                  interfaceModeSaving ? "cursor-wait opacity-70" : "cursor-pointer"
                } ${
                  selected
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-card-border bg-card hover:border-primary/50 hover:bg-card-elevated"
                } focus-within:outline-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background`}
              >
                <input
                  type="radio"
                  name="interface-mode"
                  value={mode}
                  checked={selected}
                  disabled={interfaceModeSaving}
                  onChange={() => onInterfaceModeChange(mode)}
                  className="sr-only"
                />
                <span className="flex items-center justify-between gap-3 text-sm font-semibold text-foreground">
                  {t(`appearance.${mode}Ui`)}
                  <span
                    aria-hidden
                    className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${
                      selected
                        ? "border-primary bg-primary text-white"
                        : "border-card-border text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted">
                  {t(`appearance.${mode}UiHint`)}
                </span>
              </label>
            );
          })}
        </fieldset>
      </div>

      {/* ── Corporation overview ───────────────────────────────────────── */}
      <div className="border-t border-card-border pt-6">
        <h3 className="mb-1 text-sm font-medium">{t("appearance.corpOverviewTitle")}</h3>
        <p className="mb-3 text-xs text-muted">{t("appearance.corpOverviewHint")}</p>
        <fieldset
          className="grid gap-3 sm:grid-cols-2"
          aria-label={t("appearance.corpOverviewTitle")}
        >
          {CORP_OVERVIEW_MODES.map((mode) => {
            const selected = corpOverviewMode === mode;
            return (
              <label
                key={mode}
                data-corp-overview-option
                data-selected={selected ? "true" : undefined}
                className={`relative cursor-pointer rounded-xl border px-4 py-3 text-left transition-all ${
                  selected
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-card-border bg-card hover:border-primary/50 hover:bg-card-elevated"
                } focus-within:outline-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background`}
              >
                <input
                  type="radio"
                  name="corp-overview-mode"
                  value={mode}
                  checked={selected}
                  onChange={() => setCorpOverviewMode(mode)}
                  className="sr-only"
                />
                <span className="flex items-center justify-between gap-3 text-sm font-semibold text-foreground">
                  {t(`appearance.corpOverview.${mode}`)}
                  <span
                    aria-hidden
                    className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${
                      selected
                        ? "border-primary bg-primary text-white"
                        : "border-card-border text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted">
                  {t(`appearance.corpOverview.${mode}Hint`)}
                </span>
              </label>
            );
          })}
        </fieldset>
      </div>

      {/* ── Status Bar ──────────────────────────────────────────────────── */}
      <div className="border-t border-card-border pt-6">
        <h3 className="text-sm font-medium mb-1">{t("appearance.statusBar")}</h3>
        <p className="text-xs text-muted mb-4">{t("appearance.statusBarHint")}</p>
        <div className="flex gap-3 flex-wrap">
          {(["standard", "corp", "elections", "full", "minimal"] as StatusBarLayout[])
            .map((value) => ({
              value,
              label: t(`appearance.layouts.${value}.label`),
              desc: t(`appearance.layouts.${value}.desc`),
            }))
            .map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleLayoutChange(opt.value)}
                aria-pressed={statusBarLayout === opt.value}
                className={`flex-1 min-w-[140px] rounded-xl border px-4 py-3 text-left text-sm transition-all ${
                  statusBarLayout === opt.value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-card-border bg-background text-muted hover:border-card-border hover:bg-card-elevated hover:text-foreground"
                }`}
              >
                <span className="block font-medium mb-0.5">{opt.label}</span>
                <span className="block text-xs opacity-70">{opt.desc}</span>
              </button>
            ))}
        </div>
        {statusBarLayout === "corp" && (
          <p className="mt-3 text-xs text-muted">{t("appearance.corpNote")}</p>
        )}
        {statusBarLayout === "elections" && (
          <p className="mt-3 text-xs text-muted">{t("appearance.electionsNote")}</p>
        )}
        {statusBarLayout === "full" && (
          <p className="mt-3 text-xs text-muted">{t("appearance.fullNote")}</p>
        )}
        {statusBarLayout === "minimal" && (
          <p className="mt-3 text-xs text-muted">{t("appearance.minimalNote")}</p>
        )}
      </div>
    </>
  );
}
