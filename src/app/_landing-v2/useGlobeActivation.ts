import { useEffect, useState, type RefObject } from "react";

/** Without an interaction the live globe waits past the point Lighthouse stops counting. */
export const GLOBE_FALLBACK_DELAY_MS = 6_000;

const INTERACTION_EVENTS = ["pointerdown", "touchstart", "wheel", "keydown"] as const;

/**
 * True when the interactive globe's code and map data may load: the page has
 * loaded and gone idle, the globe box is on screen, and the visitor has either
 * interacted or waited out the fallback delay. Without a poster there is
 * nothing to show meanwhile, so the interaction wait is skipped. Reduced motion
 * keeps the poster, so with one the globe never loads.
 */
export function useGlobeActivation(boxRef: RefObject<Element | null>, hasPoster: boolean): boolean {
  const [idle, setIdle] = useState(false);
  const [visible, setVisible] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let idleHandle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const go = () => {
      if (cancelled) return;
      if ("requestIdleCallback" in window) {
        idleHandle = window.requestIdleCallback(() => setIdle(true), { timeout: 2_500 });
      } else {
        timer = setTimeout(() => setIdle(true), 300);
      }
    };
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", go);
      if (idleHandle !== undefined) window.cancelIdleCallback(idleHandle);
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const node = boxRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [boxRef]);

  useEffect(() => {
    const engage = () => setEngaged(true);
    for (const name of INTERACTION_EVENTS) {
      window.addEventListener(name, engage, { once: true, passive: true });
    }
    const timer = setTimeout(engage, GLOBE_FALLBACK_DELAY_MS);
    return () => {
      clearTimeout(timer);
      for (const name of INTERACTION_EVENTS) window.removeEventListener(name, engage);
    };
  }, []);

  if (hasPoster && reduced) return false;
  return idle && visible && (engaged || !hasPoster);
}
