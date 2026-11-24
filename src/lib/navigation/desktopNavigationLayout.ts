export const DESKTOP_NAVIGATION_LAYOUTS = ["cards", "standard"] as const;

export type DesktopNavigationLayout = (typeof DESKTOP_NAVIGATION_LAYOUTS)[number];

/**
 * Every player's desktop layout: their saved choice, or grouped cards when they
 * have not picked one. Presentation only; the phone layout is chosen separately.
 */
export function desktopNavigationLayout(value: unknown): DesktopNavigationLayout {
  // The retired section browser and compact directory read as grouped cards.
  return DESKTOP_NAVIGATION_LAYOUTS.find((layout) => layout === value) ?? "cards";
}
