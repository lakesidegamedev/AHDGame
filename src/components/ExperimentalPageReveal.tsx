"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { AsciiReveal } from "ascii-reveal";
import type { AsciiRevealHandle } from "ascii-reveal";
import { isChromeHiddenPath, isLightweightLayoutPath } from "@/lib/constants/layoutPaths";

/**
 * How often to look for the route's real content, how long to keep looking,
 * and how much text the wrapper must hold first.
 *
 * A route renders its loading skeleton before the page behind it, and a
 * skeleton is markup with no text (the shared `<Skeleton>` is `aria-hidden`).
 * Revealing on mount therefore decoded the skeleton and let the real page
 * arrive plain. Waiting for text and for the skeleton to clear keeps the
 * decode on the content the player came for; the interval rather than a
 * mutation debounce means a page that keeps updating still reveals.
 */
const POLL_INTERVAL_MS = 100;
const MAX_WAIT_MS = 10000;
const MIN_TEXT_LENGTH = 20;

/**
 * Experimental (Settings, Experimental features): decode each page into place
 * through an ASCII character grid.
 *
 * Mounted from `app/template.tsx`, so it covers page content only (the navbar
 * and status bar stay put). `enabled` comes from the server, which reads the
 * opt-in cookie mirrored from the user record, so a page load decodes too and
 * a signed-out visitor never carries the effect.
 *
 * The reveal is driven from here rather than by `revealOnMount`. A root
 * template only remounts when the first URL segment changes, so the wrapper is
 * keyed on the pathname to replay inside one section (two corporations, two
 * bills, two profiles), and `revealOnMount` adds an attribute the server HTML
 * cannot have, which React reports as a hydration mismatch and does not patch
 * up.
 */
export function ExperimentalPageReveal({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const revealRef = useRef<AsciiRevealHandle>(null);
  const skip = isChromeHiddenPath(pathname) || isLightweightLayoutPath(pathname);

  useEffect(() => {
    if (!enabled || skip) return;
    const host = revealRef.current?.element;
    if (!host) return;

    const startedAt = Date.now();
    let revealed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = () => {
      if (revealed) return;
      const stillLoading = host.querySelector(".animate-pulse") !== null;
      const hasText = (host.innerText ?? "").trim().length >= MIN_TEXT_LENGTH;
      if ((stillLoading || !hasText) && Date.now() - startedAt < MAX_WAIT_MS) {
        timer = setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }
      revealed = true;
      void revealRef.current?.reveal();
    };

    poll();
    return () => clearTimeout(timer);
  }, [enabled, skip, pathname]);

  // Chrome-free and lightweight pages (sign-in, banned, the marketing pages)
  // are not game screens a player moves between, so they stay untouched.
  if (!enabled || skip) {
    return <>{children}</>;
  }

  return (
    <AsciiReveal
      ref={revealRef}
      key={pathname}
      className="ascii-reveal-host"
      preset="decode"
      duration="fast"
      lazy
      revealOnMount={false}
    >
      {children}
    </AsciiReveal>
  );
}
