"use client";

/**
 * Market-identity primitives for the player-corporation surface.
 *
 * Ported from the approved design prototype
 * (docs/superpowers/specs/2026-05-31-player-corp-prototype/src/pcomponents.jsx),
 * translated to project semantic tokens so all themes keep working:
 *  - prototype `up`/`down`   → `success`/`error`
 *  - prototype `brand-*`     → the scoped `--brand` CSS var (set from the corp's
 *                              brandColor by the masthead) for accents
 *  - SVG strokes use `currentColor` driven by a text-color class (theme-safe)
 */

/* Progress / composite meter. */
export function Meter({
  value,
  max = 100,
  tone = "brand",
  height = 8,
}: {
  value: number;
  max?: number;
  tone?: "brand" | "up" | "down" | "warning";
  height?: number;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const toneClass =
    tone === "up"
      ? "bg-success"
      : tone === "down"
        ? "bg-error"
        : tone === "warning"
          ? "bg-warning"
          : "";
  return (
    <div
      className="overflow-hidden rounded-full border border-card-border bg-card-muted"
      style={{ height }}
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ${toneClass}`}
        style={{
          width: pct + "%",
          ...(tone === "brand"
            ? {
                background:
                  "linear-gradient(90deg, color-mix(in srgb, var(--brand, #3b82f6) 65%, black), var(--brand, #3b82f6))",
              }
            : {}),
        }}
      />
    </div>
  );
}
