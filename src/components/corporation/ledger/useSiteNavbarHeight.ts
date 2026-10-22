"use client";

import { useEffect, useState } from "react";

/**
 * The site navbar is sticky with a variable height (it includes the safe-area
 * inset), and the loading navbar is swapped for the real one after mount.
 * Measure it and expose it to the page as `--site-navbar-h`, so anything
 * sticky on the page can sit just under it.
 *
 * Returns a callback ref for the page root: the root may only appear after a
 * loading state, and the measurement starts when it does.
 */
export function useSiteNavbarHeight(): (element: HTMLElement | null) => void {
  const [root, setRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!root) return;
    let observed: HTMLElement[] = [];
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => apply());

    function apply() {
      if (!root) return;
      const navbars = Array.from(document.querySelectorAll<HTMLElement>("[data-site-navbar]"));
      if (navbars.length === 0) return;
      const height = Math.max(0, ...navbars.map((nav) => nav.getBoundingClientRect().height));
      root.style.setProperty("--site-navbar-h", `${Math.round(height)}px`);
      if (observer && navbars.some((nav) => !observed.includes(nav))) {
        observer.disconnect();
        navbars.forEach((nav) => observer.observe(nav));
        observed = navbars;
      }
    }

    apply();
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      observer?.disconnect();
    };
  }, [root]);

  return setRoot;
}
