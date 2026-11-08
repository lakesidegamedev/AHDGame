"use client";

import { useGameClock } from "@/contexts/useGameClock";

interface ClockDriftBannerProps {
  /**
   * Where the "investigate" link should point. Defaults to "/control", the one
   * panel every staff role uses, so the link routes
   * moderators to a page they actually have access to.
   */
  panelHref?: string;
  /** Human-readable label for the destination panel. Defaults to "control panel". */
  panelLabel?: string;
}

/**
 * Staff banner for a cron-stall auto-pause (`pauseKind === "auto-drift"`);
 * renders null otherwise. Game-clock/wall-clock drift is not surfaced
 * because deadlines are turn-based.
 *
 * Mount inside a staff panel layout; consumes `useGameClock` for shared
 * polling. Gate visibility at the mount point, not here.
 */
export function ClockDriftBanner({
  panelHref = "/control",
  panelLabel = "control panel",
}: ClockDriftBannerProps = {}) {
  const clock = useGameClock();

  if (clock.pauseKind === "auto-drift") {
    return (
      <div className="bg-error/10 text-error px-4 py-2 text-sm">
        <strong>Cron auto-paused.</strong>{" "}
        {clock.pauseReason ?? "Drift exceeded auto-pause threshold."}{" "}
        <a className="underline" href={panelHref}>
          Open {panelLabel} to investigate &rarr;
        </a>
      </div>
    );
  }

  return null;
}
