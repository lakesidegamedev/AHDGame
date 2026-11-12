/**
 * Rising or falling arrow for an approval modifier. A modifier that nets to
 * zero, such as a live war, gets a flat bar: it is neither costing nor
 * earning approval.
 */
export function ApprovalEffectIcon({
  effect,
  sizeClass,
}: {
  effect: number;
  /** Tailwind size classes, e.g. `h-3 w-3`. */
  sizeClass: string;
}) {
  if (effect === 0) {
    return (
      <svg
        className={`${sizeClass} text-slate-500 shrink-0`}
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden
      >
        <path d="M5.75 10.75a.75.75 0 010-1.5h8.5a.75.75 0 010 1.5h-8.5z" />
      </svg>
    );
  }
  if (effect > 0) {
    return (
      <svg
        className={`${sizeClass} text-emerald-500 shrink-0`}
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M10 3a.75.75 0 01.75.75v10.5a.75.75 0 01-1.5 0V3.75A.75.75 0 0110 3z"
          clipRule="evenodd"
        />
        <path d="M5.75 8.25a.75.75 0 010-1.5h8.5a.75.75 0 010 1.5h-8.5z" />
      </svg>
    );
  }
  return (
    <svg
      className={`${sizeClass} text-rose-500 shrink-0`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M10 3a.75.75 0 01.75.75v10.5a.75.75 0 01-1.5 0V3.75A.75.75 0 0110 3z"
        clipRule="evenodd"
      />
      <path d="M5.75 11.75a.75.75 0 010-1.5h8.5a.75.75 0 010 1.5h-8.5z" />
    </svg>
  );
}
