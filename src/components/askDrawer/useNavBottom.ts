"use client";

import { useEffect, useState } from "react";

/**
 * Where the top nav ends, so the drawer opens below it and the nav stays on
 * top. The nav is sticky and changes height (loading shell, safe area,
 * mobile menu), so it is measured rather than assumed.
 */
export function useNavBottom(active: boolean): number {
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
