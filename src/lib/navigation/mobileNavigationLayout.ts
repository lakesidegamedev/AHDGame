export const MOBILE_NAVIGATION_LAYOUTS = ["dock", "standard"] as const;

export type MobileNavigationLayout = (typeof MOBILE_NAVIGATION_LAYOUTS)[number];

/**
 * Every player's phone layout: their saved choice, or the bottom dock when they
 * have not picked one. Presentation only; the desktop layout is chosen separately.
 */
export function mobileNavigationLayout(value: unknown): MobileNavigationLayout {
  return MOBILE_NAVIGATION_LAYOUTS.find((layout) => layout === value) ?? "dock";
}
