/**
 * Vertical focus for hero banners whose subject is not centred. The overview
 * banner is a thin strip, so a centred crop can cut through the subject.
 * Keyed by the hero slug served from /api/images/hero/<slug>.
 */
const HERO_OBJECT_POSITION: Record<string, string> = {
  // The four faces sit about a third of the way down the photo.
  "us-overview-mount-rushmore": "center 35%",
};

/** CSS object-position for a hero image URL, or "center" when it has no entry. */
export function heroObjectPosition(src: string | null | undefined): string {
  const slug = src?.match(/\/api\/images\/hero\/([^/?#]+)/)?.[1];
  return (slug && HERO_OBJECT_POSITION[slug]) || "center";
}
