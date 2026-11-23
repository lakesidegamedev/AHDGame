export const MODELLED_MARGIN_TITLE =
  "Estimate: this sector had no sales to measure last turn, so the margin shown is what its modifiers add up to, not a realized result.";

/** Marks a margin that comes from the modifier stack rather than realized revenue. */
export function ModelledMarginMark({ modelled }: { modelled?: boolean }) {
  if (!modelled) return null;
  return (
    <span
      data-testid="modelled-margin-mark"
      title={MODELLED_MARGIN_TITLE}
      className="ml-1 cursor-help font-sans text-[10px] font-normal text-muted"
    >
      est.
    </span>
  );
}
