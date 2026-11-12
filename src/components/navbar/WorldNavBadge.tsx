export function WorldNavBadge({ count }: { count?: number }) {
  if (!count || count <= 0) return null;
  return (
    <span
      className="ml-auto rounded-full bg-error px-1.5 py-px text-[10px] font-semibold tabular-nums text-white"
      aria-label={`${count} need your response`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
