"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useOptionalAuthMe, useRefetchNav } from "@/contexts/AuthDataContext";
import { fetchJson } from "@/lib/observability/fetchJson";
import { isChromeHiddenPath, isLightweightLayoutPath } from "@/lib/constants/layoutPaths";
import type { AskDrawerSide } from "@/components/askDrawer/AskDrawerPanel";
import { KeirAvatar, KeirSprite } from "@/components/askDrawer/KeirSprite";

// The Ask Keir drawer, docked to the left or right edge of most pages for every
// signed-in player. On a phone it opens as a full-screen sheet over the whole
// page, nav included, from a floating Keir button. The panel and its markdown renderer load
// on first open, so the tab costs almost nothing.

/**
 * Where the top nav ends, so the drawer opens below it and the nav stays on
 * top. The nav is sticky and changes height (loading shell, safe area,
 * mobile menu), so it is measured rather than assumed.
 */
function useNavBottom(active: boolean): number {
  const [bottom, setBottom] = useState(0);
  useEffect(() => {
    if (!active) return;
    const measure = () => {
      // The nav is sticky at the top and slides in with a transform when the
      // page loads, so its on-screen position can read as 0 mid-animation.
      // Its layout height is stable and is where it ends once settled.
      const navs = Array.from(document.querySelectorAll<HTMLElement>("[data-site-navbar]"));
      setBottom(Math.max(0, ...navs.map((el) => el.offsetHeight)));
    };
    measure();
    // The loading shell swaps for the real nav after auth resolves.
    const frame = window.requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    document.querySelectorAll("[data-site-navbar]").forEach((el) => observer.observe(el));
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [active]);
  return bottom;
}

/** Phones get the sheet layout; matches Tailwind's sm breakpoint. */
const MOBILE_QUERY = "(max-width: 639px)";

function isMobileViewport(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(MOBILE_QUERY).matches;
}

function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(MOBILE_QUERY);
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return phone;
}

/**
 * The part of the screen the player can actually see. When the iOS keyboard
 * opens, Safari pans the page up under it, which pushed a sheet pinned to the
 * layout viewport (header and all) off the top of the screen. Pinning the
 * sheet to the visual viewport keeps its header and composer in view.
 */
export function visibleArea(
  layoutHeight: number,
  viewport: { height: number; offsetTop: number } | null | undefined
): { top: number; height: number } {
  if (!viewport) return { top: 0, height: layoutHeight };
  return { top: Math.max(0, Math.round(viewport.offsetTop)), height: Math.round(viewport.height) };
}

function useVisibleArea(active: boolean): { top: number; height: number } | null {
  const [area, setArea] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!active || !viewport) return;
    const measure = () => setArea(visibleArea(window.innerHeight, viewport));
    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
      setArea(null);
    };
  }, [active]);
  return area;
}

/**
 * How much of the layout viewport the on-screen keyboard covers, so the
 * composer can sit above it. Zero on desktop and when no keyboard is up.
 */
export function keyboardInset(
  layoutHeight: number,
  viewport: { height: number; offsetTop: number } | null | undefined
): number {
  if (!viewport) return 0;
  return Math.max(0, Math.round(layoutHeight - viewport.height - viewport.offsetTop));
}

function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!active || !viewport) return;
    const measure = () => setInset(keyboardInset(window.innerHeight, viewport));
    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
      setInset(0);
    };
  }, [active]);
  return inset;
}

/** The page behind a full-screen sheet should not scroll under the player's finger. */
function useMobileScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || !isMobileViewport()) return;
    const body = document.body;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previous;
    };
  }, [active]);
}

const AskDrawerPanel = dynamic(
  () => import("@/components/askDrawer/AskDrawerPanel").then((m) => m.AskDrawerPanel),
  { ssr: false }
);

export function AskDrawer() {
  const auth = useOptionalAuthMe();
  const refetchNav = useRefetchNav();
  const pathname = usePathname();
  const user = auth?.user ?? null;
  const serverSide: AskDrawerSide = user?.askDrawerSide === "left" ? "left" : "right";
  const [side, setSide] = useState<AskDrawerSide>(serverSide);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- follow the account preference once it loads */
  useEffect(() => {
    setSide(serverSide);
  }, [serverSide]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const swapSide = useCallback(() => {
    const next: AskDrawerSide = side === "right" ? "left" : "right";
    setSide(next);
    // The drawer has already moved; a failed save only means it moves back next visit.
    fetchJson("/api/settings/experimental-features", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ askDrawerSide: next }),
      feature: "ask-drawer-side",
    })
      .then(() => refetchNav())
      .catch(() => undefined);
  }, [refetchNav, side]);

  const close = useCallback(() => setOpen(false), []);
  // Measured each time the drawer opens, when the real nav is in place.
  const phone = useIsPhone();
  const navBottom = useNavBottom(open && !phone);
  const keyboard = useKeyboardInset(open && !phone);
  const area = useVisibleArea(open && phone);
  useMobileScrollLock(open);

  if (!user) return null;
  if (isChromeHiddenPath(pathname) || isLightweightLayoutPath(pathname)) return null;

  const left = side === "left";
  // Phones: the sheet covers the screen, nav included, and slides up from the
  // bottom. Wider screens: docked under the nav on the chosen edge.
  const sheetStyle = phone
    ? area
      ? { top: area.top, height: area.height }
      : { top: 0, bottom: 0 }
    : { top: navBottom, bottom: keyboard };
  const hidden = phone ? "translate-y-full" : left ? "-translate-x-full" : "translate-x-full";
  const openDrawer = () => {
    setMounted(true);
    setOpen(true);
  };
  return (
    <>
      {!open && (
        <>
          <button
            type="button"
            onClick={openDrawer}
            aria-label="Open Ask Keir"
            title="Ask Keir about this page"
            data-feedback-ignore="true"
            className={`fixed top-1/2 z-[44] hidden -translate-y-1/2 flex-col items-center gap-1 border border-primary/30 bg-card/95 px-1 pb-2.5 pt-1.5 text-xs font-semibold text-primary shadow-modal backdrop-blur-md transition-colors hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:flex ${left ? "left-0 rounded-r-lg border-l-0" : "right-0 rounded-l-lg border-r-0"}`}
          >
            <KeirSprite mood="idle" />
            <span className="[writing-mode:vertical-rl]">Ask</span>
          </button>
          {/* Phones: a round Keir in the corner, below the bug report button. */}
          {/* Sits above the fixed bottom StatusBar, whose real height (safe area
              included) is published as --status-bar-height. Pinned to the
              viewport edge it covered the money chips on phones. */}
          <button
            type="button"
            onClick={openDrawer}
            aria-label="Open Ask Keir"
            title="Ask Keir about this page"
            data-feedback-ignore="true"
            data-ask-fab
            className="fixed bottom-[calc(max(var(--status-bar-height,0px),env(safe-area-inset-bottom))+0.75rem)] right-4 z-[44] flex h-14 w-14 items-center justify-center rounded-full border-2 border-primary/50 bg-card shadow-modal focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:hidden"
          >
            <KeirAvatar mood="idle" size={52} />
          </button>
        </>
      )}
      <aside
        aria-label="Ask"
        aria-hidden={!open}
        inert={!open}
        data-feedback-ignore="true"
        data-ask-sheet={phone ? "phone" : "dock"}
        style={sheetStyle}
        className={`fixed w-full border-card-border/80 bg-card pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] shadow-modal transition-transform duration-300 ease-out sm:max-w-[420px] sm:pl-0 sm:pr-0 sm:pt-0 ${phone ? "z-[60]" : "z-[45]"} ${left ? "left-0 sm:border-r" : "right-0 sm:border-l"} ${open ? "translate-x-0 translate-y-0" : hidden}`}
      >
        {mounted && <AskDrawerPanel side={side} onClose={close} onSwapSide={swapSide} />}
      </aside>
    </>
  );
}
