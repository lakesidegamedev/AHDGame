/**
 * Loading frame for the embedded election-night board, sized to the board it
 * becomes (measured on a US House night: 945 px on a phone, 637 px at 768,
 * 541 px at 1440) so the race list below does not drop when results arrive.
 * Shared by the lazy chunk's fallback and the board's own loading state.
 */
export const EMBEDDED_RESULTS_PLACEHOLDER_CLASS =
  "mb-6 h-[56rem] animate-pulse rounded-xl border border-card-border bg-card sm:h-[38rem] lg:h-[34rem]";
