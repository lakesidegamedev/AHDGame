"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AsciiReveal } from "ascii-reveal";
import { useOptionalAuthMe } from "@/contexts/AuthDataContext";
import { isChromeHiddenPath, isLightweightLayoutPath } from "@/lib/constants/layoutPaths";

/**
 * Experimental (Settings, Experimental features): decode each page into place
 * through an ASCII character grid when the player navigates.
 *
 * Mounted from `app/template.tsx`, so the wrapper is a fresh instance on every
 * navigation and the decode plays once per page. Content stays in the DOM in
 * its real position; the glyphs are painted on a canvas above it, so nothing
 * shifts. Reduced-motion players get a short fade instead.
 *
 * The opt-in is read once, at mount, and never again. `/api/client-nav`
 * resolves a beat after the first paint, and swapping this wrapper in when it
 * lands would unmount and remount the whole page subtree below it, throwing
 * away client state and re-running every effect under it. Freezing the
 * decision means the first page of a visit renders untouched and the effect
 * starts with the next navigation.
 */
export function ExperimentalPageReveal({ children }: { children: ReactNode }) {
  const auth = useOptionalAuthMe();
  const pathname = usePathname();
  const [enabled] = useState(() => auth?.user?.experimentalFeatures === true);

  // Chrome-free and lightweight pages (sign-in, banned, the marketing pages)
  // are not game screens a player moves between, so they stay untouched.
  if (!enabled || isChromeHiddenPath(pathname) || isLightweightLayoutPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <AsciiReveal className="ascii-reveal-host" preset="decode" duration="fast" lazy>
      {children}
    </AsciiReveal>
  );
}
