import { useEffect, type RefObject } from "react";

/** Mirrors MobileDock's event name; kept local so the status bar does not load the navbar. */
const MOBILE_DOCK_EVENT = "ahd:mobile-dock";

/** CSS custom property holding the fixed StatusBar's rendered height in px. */
export const STATUS_BAR_HEIGHT_VAR = "--status-bar-height";

/**
 * Publish the fixed bottom StatusBar's real height as a CSS variable on <html>
 * so the page can reserve exactly that much space under its last element.
 *
 * The bar is `position: fixed`, so it takes no room in the flow. A flat
 * `pb-14` (56px) on <main> covers it on desktop, but on a phone in portrait
 * the bar wraps to two rows and adds the home-indicator safe area, roughly
 * doubling its height. Pages with no footer (the admin and mod panels) then
 * ended with their last row, such as the Next page control, permanently
 * under the bar with no way to scroll it into view.
 */
export function useStatusBarHeightVar(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const root = typeof document !== "undefined" ? document.documentElement : null;
    if (!root) return;
    const el = ref.current;
    if (!active || !el) {
      root.style.removeProperty(STATUS_BAR_HEIGHT_VAR);
      return;
    }
    // On phones with the navigation dock the bar sits above the dock, so the
    // space to reserve is the bar plus its offset from the bottom edge.
    const publish = () => {
      const offset = parseFloat(getComputedStyle(el).bottom) || 0;
      root.style.setProperty(
        STATUS_BAR_HEIGHT_VAR,
        `${Math.ceil(el.getBoundingClientRect().height + offset)}px`
      );
    };
    publish();
    window.addEventListener(MOBILE_DOCK_EVENT, publish);
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", publish);
      return () => {
        window.removeEventListener("resize", publish);
        window.removeEventListener(MOBILE_DOCK_EVENT, publish);
        root.style.removeProperty(STATUS_BAR_HEIGHT_VAR);
      };
    }
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.removeEventListener(MOBILE_DOCK_EVENT, publish);
      root.style.removeProperty(STATUS_BAR_HEIGHT_VAR);
    };
  }, [ref, active]);
}
