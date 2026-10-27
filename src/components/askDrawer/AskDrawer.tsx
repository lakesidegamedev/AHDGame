"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useOptionalAuthMe, useRefetchNav } from "@/contexts/AuthDataContext";
import { fetchJson } from "@/lib/observability/fetchJson";
import { isChromeHiddenPath, isLightweightLayoutPath } from "@/lib/constants/layoutPaths";
import type { AskDrawerSide } from "@/components/askDrawer/AskDrawerPanel";

// Experimental: the Ask drawer, docked to the left or right edge of most pages
// for players who opted in to experimental features in Settings. The panel and
// its markdown renderer load on first open, so the tab costs almost nothing.

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
  const navBottom = useNavBottom(open);

  if (!user || user.experimentalFeatures !== true) return null;
  if (isChromeHiddenPath(pathname) || isLightweightLayoutPath(pathname)) return null;

  const left = side === "left";
  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => {
            setMounted(true);
            setOpen(true);
          }}
          aria-label="Open Ask"
          title="Ask about this page"
          data-feedback-ignore="true"
          className={`fixed top-1/2 z-[44] flex -translate-y-1/2 items-center gap-1.5 border border-primary/30 bg-card/95 px-1.5 py-3 text-xs font-semibold text-primary shadow-modal backdrop-blur-md transition-colors hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary [writing-mode:vertical-rl] ${left ? "left-0 rotate-180 rounded-l-lg border-l-0" : "right-0 rounded-l-lg border-r-0"}`}
        >
          <svg
            className="h-4 w-4 rotate-90"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 10h8M8 14h5m-9 6l2.5-3H18a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v14z"
            />
          </svg>
          Ask
        </button>
      )}
      {open && (
        <div
          className="fixed inset-x-0 bottom-0 z-[44] bg-black/30 sm:hidden"
          style={{ top: navBottom }}
          onClick={close}
          aria-hidden
          data-feedback-ignore="true"
        />
      )}
      <aside
        aria-label="Ask"
        aria-hidden={!open}
        inert={!open}
        data-feedback-ignore="true"
        style={{ top: navBottom, bottom: 0 }}
        className={`fixed z-[45] w-full max-w-[420px] border-card-border/80 bg-card shadow-modal transition-transform duration-300 ease-out ${left ? "left-0 border-r" : "right-0 border-l"} ${open ? "translate-x-0" : left ? "-translate-x-full" : "translate-x-full"}`}
      >
        {mounted && <AskDrawerPanel side={side} onClose={close} onSwapSide={swapSide} />}
      </aside>
    </>
  );
}
