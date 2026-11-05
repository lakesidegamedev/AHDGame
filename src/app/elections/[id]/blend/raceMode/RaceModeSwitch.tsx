"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BLEND, FONT } from "@/components/blend/tokens";
import { raceModeSwitchQuery, type RaceMode } from "@/lib/campaignManager/raceMode";

const OPTIONS: Array<{ mode: RaceMode; label: string }> = [
  { mode: "race", label: "Race" },
  { mode: "campaign", label: "Campaign" },
];

/**
 * The Race / Campaign switch. Plain links to the same page with `view` set, so
 * the mode is in the URL: it can be shared and the back button works.
 */
export function RaceModeSwitch({ mode }: { mode: RaceMode }) {
  const searchParams = useSearchParams();
  return (
    <nav
      aria-label="Race view"
      style={{ display: "inline-flex", flexShrink: 0, border: `1px solid ${BLEND.hairlineStrong}` }}
    >
      {OPTIONS.map((o) => {
        const active = mode === o.mode;
        return (
          <Link
            key={o.mode}
            href={`?${raceModeSwitchQuery(searchParams ?? new URLSearchParams(), o.mode)}`}
            scroll={false}
            aria-current={active ? "page" : undefined}
            style={{
              padding: "6px 14px",
              fontFamily: FONT.mono,
              fontSize: 11,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              textDecoration: "none",
              color: active ? BLEND.ink : BLEND.muted,
              background: active ? BLEND.hairlineStrong : "transparent",
            }}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}
