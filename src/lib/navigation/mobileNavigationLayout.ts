export const MOBILE_NAVIGATION_LAYOUTS = ["dock", "standard"] as const;

export type MobileNavigationLayout = (typeof MOBILE_NAVIGATION_LAYOUTS)[number];

export function mobileNavigationLayout(value: unknown): MobileNavigationLayout {
  return MOBILE_NAVIGATION_LAYOUTS.find((layout) => layout === value) ?? "dock";
}

/** Presentation only. The desktop navigation has its own independent selection. */
export function experimentalMobileLayout(
  experimentalFeatures: unknown,
  preference: unknown
): MobileNavigationLayout | null {
  return experimentalFeatures === true ? mobileNavigationLayout(preference) : null;
}
