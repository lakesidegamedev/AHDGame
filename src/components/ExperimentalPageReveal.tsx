"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { isChromeHiddenPath, isLightweightLayoutPath } from "@/lib/constants/layoutPaths";

/**
 * While this attribute is on the wrapper its content is invisible and a glyph
 * shimmer plays in its place. The page assembles underneath (route skeleton,
 * then data, then late panels), so the player never sees it jump. Styled in
 * globals.css, which also carries a CSS failsafe that shows the content if the
 * script never runs.
 */
export const REVEAL_WAITING_ATTR = "data-reveal-waiting";

/** The page must hold still this long before it decodes in. */
export const QUIET_MS = 300;
/** Once real text is in, stop waiting on a panel that keeps its skeleton. */
export const SKELETON_GRACE_MS = 1200;
/** Never hold a page back longer than this, however busy it is. */
export const MAX_WAIT_MS = 2500;
const MIN_TEXT_LENGTH = 10;
const POLL_INTERVAL_MS = 50;

/**
 * Whether the covered page is ready to decode in. A page is ready once it has
 * real text and has stopped changing, and it no longer shows a loading
 * skeleton (or has had text for a while despite one). The cap wins regardless.
 */
export function readyToReveal(state: {
  now: number;
  startedAt: number;
  lastMutationAt: number;
  textSince: number | null;
  stillLoading: boolean;
}): boolean {
  const { now, startedAt, lastMutationAt, textSince, stillLoading } = state;
  if (now - startedAt >= MAX_WAIT_MS) return true;
  if (textSince === null) return false;
  if (now - lastMutationAt < QUIET_MS) return false;
  return !stillLoading || now - textSince >= SKELETON_GRACE_MS;
}

function hasReadableText(host: HTMLElement): boolean {
  return (host.textContent ?? "").trim().length >= MIN_TEXT_LENGTH;
}

function animatePage(
  host: HTMLDivElement,
  startedAt: number,
  createAsciiReveal: typeof import("ascii-reveal/core").createAsciiReveal
) {
  const controller = createAsciiReveal(host, {
    preset: "decode",
    duration: "fast",
    speed: 1.5,
    lazy: true,
    fallback: false,
  });
  controller.shimmer(true);

  let lastMutationAt = performance.now();
  let textSince: number | null = null;
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target?.closest(".ar-overlay")) continue;
      lastMutationAt = performance.now();
      return;
    }
  });
  observer.observe(host, { childList: true, subtree: true, characterData: true });

  const finish = () => {
    finished = true;
    observer.disconnect();
    controller.shimmer(false);
    // Lift the cover after hiding the content so it can decode without a flash.
    void controller.hide({ instant: true });
    host.removeAttribute(REVEAL_WAITING_ATTR);
    void controller.reveal();
  };

  const poll = () => {
    if (finished) return;
    const now = performance.now();
    if (textSince === null && hasReadableText(host)) textSince = now;
    if (
      readyToReveal({
        now,
        startedAt,
        lastMutationAt,
        textSince,
        stillLoading: host.querySelector(".animate-pulse") !== null,
      })
    ) {
      finish();
    } else {
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }
  };
  poll();

  return () => {
    finished = true;
    clearTimeout(timer);
    observer.disconnect();
    controller.destroy();
  };
}

/**
 * The first mount is the hydration of server HTML. Everything after it is an
 * in-app navigation, which can start covered from its first paint.
 */
let hydrated = false;

/**
 * Experimental: decode page content into place through an ASCII character
 * grid. Mounted from `app/template.tsx` so navbar and status bar stay put.
 *
 * The wrapper is keyed on pathname because a root template only remounts when
 * the first URL segment changes.
 */
export function ExperimentalPageReveal({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const hostRef = useRef<HTMLDivElement>(null);
  const skip = isChromeHiddenPath(pathname) || isLightweightLayoutPath(pathname);
  // Server HTML and its hydration render without the cover so they match;
  // client navigations render it so the half-built page is never painted.
  // Decided once per path: a later re-render must not cover a page that is
  // already showing.
  const [cover, setCover] = useState(() => ({ path: pathname, on: hydrated }));
  if (cover.path !== pathname) setCover({ path: pathname, on: true });
  const coverFromFirstPaint = cover.path === pathname ? cover.on : true;

  useEffect(() => {
    const firstMount = !hydrated;
    hydrated = true;
    if (!enabled || skip) return;
    const host = hostRef.current;
    if (!host) return;

    // Server HTML with real text is already on screen. Hiding it to wait on a
    // late panel's skeleton blanks a readable page and pushes its largest paint
    // back by the whole wait, so only a pure route skeleton is covered.
    if (firstMount && hasReadableText(host)) return;

    host.setAttribute(REVEAL_WAITING_ATTR, "");
    const startedAt = performance.now();
    let cancelled = false;
    let stopAnimation: (() => void) | undefined;
    const uncover = () => {
      cancelled = true;
      host.removeAttribute(REVEAL_WAITING_ATTR);
    };
    const loadDeadline = setTimeout(uncover, MAX_WAIT_MS);

    void import("ascii-reveal/core")
      .then(({ createAsciiReveal }) => {
        if (cancelled) return;
        clearTimeout(loadDeadline);
        stopAnimation = animatePage(host, startedAt, createAsciiReveal);
      })
      .catch(() => {
        clearTimeout(loadDeadline);
        uncover();
      });

    return () => {
      clearTimeout(loadDeadline);
      stopAnimation?.();
      uncover();
    };
  }, [enabled, skip, pathname]);

  // Chrome-free and lightweight pages (sign-in, banned, the marketing pages)
  // are not game screens a player moves between, so they stay untouched.
  if (!enabled || skip) {
    return <>{children}</>;
  }

  return (
    <div
      ref={hostRef}
      key={pathname}
      className="ascii-reveal-host"
      {...(coverFromFirstPaint ? { [REVEAL_WAITING_ATTR]: "" } : {})}
    >
      {children}
    </div>
  );
}

/** Test hook: treat the next mount as the first one again. */
export function resetRevealHydrationForTests() {
  hydrated = false;
}
