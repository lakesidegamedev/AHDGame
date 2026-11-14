"use client";

import { useEffect } from "react";
import { sendIntakeBeacon, sendIntakeBeaconOnce } from "@/lib/analytics/intakeBeacon";
import { classifyLandingCta } from "@/lib/analytics/landingCta";

export { classifyLandingCta };

/**
 * Anonymous landing counts for logged-out visitors: one view per page load and
 * which call-to-action they click. One delegated listener, so no link on the
 * page needs to know about analytics.
 */
export function LandingIntakeBeacon() {
  useEffect(() => {
    sendIntakeBeaconOnce("landing_viewed", "landing_viewed", { surface: "landing" });
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a");
      const cta = classifyLandingCta(anchor?.getAttribute("href") ?? null);
      if (cta) sendIntakeBeacon("landing_cta_clicked", { surface: "landing", cta });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
