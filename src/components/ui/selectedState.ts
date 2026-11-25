/**
 * One selected state for every tab bar, segmented control and filter pill:
 * a filled pill in the theme's primary colour. Unselected options are plain
 * muted text that lifts on hover. No underlines, no dark or inverted pills.
 *
 * Use pillClass for each option and PILL_TRACK (optional) for the group.
 * Sizing (padding, text size) stays with the caller.
 */
export const PILL_SELECTED = "bg-primary font-semibold text-primary-foreground";
export const PILL_IDLE = "text-muted hover:bg-card-elevated hover:text-foreground";
export const PILL_SHAPE = "rounded-full transition-colors";
/** Group wrapper for segmented controls: a quiet track the pills sit in. */
export const PILL_TRACK = "inline-flex items-center gap-1 rounded-full bg-card-muted p-0.5";

export function pillClass(selected: boolean): string {
  return `${PILL_SHAPE} ${selected ? PILL_SELECTED : PILL_IDLE}`;
}
