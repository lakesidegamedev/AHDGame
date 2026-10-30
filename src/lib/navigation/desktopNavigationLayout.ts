export const DESKTOP_NAVIGATION_LAYOUTS = ["cards", "standard"] as const;

export type DesktopNavigationLayout = (typeof DESKTOP_NAVIGATION_LAYOUTS)[number];

export function desktopNavigationLayout(value: unknown): DesktopNavigationLayout {
  // The retired section browser and compact directory read as grouped cards.
  return DESKTOP_NAVIGATION_LAYOUTS.find((layout) => layout === value) ?? "cards";
}

/** Presentation only. The mobile navigation has its own independent selection. */
export function experimentalDesktopLayout(
  experimentalFeatures: unknown,
  preference: unknown
): DesktopNavigationLayout | null {
  return experimentalFeatures === true ? desktopNavigationLayout(preference) : null;
}
