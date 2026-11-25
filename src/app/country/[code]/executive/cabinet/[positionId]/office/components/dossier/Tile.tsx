const TONE_CLASS: Record<string, string> = {
  up: "text-success",
  down: "text-error",
  warning: "text-warning",
  gov: "text-gov-soft",
  muted: "text-muted",
};

export function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "up" | "down" | "warning" | "gov" | "muted";
}) {
  return (
    <div className="flex min-w-[110px] flex-1 flex-col justify-between gap-1 px-4 py-3.5">
      <span className="dossier-label truncate text-muted">{label}</span>
      <div className="flex flex-col">
        <span
          className={`tabular text-heading font-bold leading-tight ${tone ? TONE_CLASS[tone] : "text-foreground"}`}
        >
          {value}
        </span>
        {sub && <span className="text-body-sm text-muted">{sub}</span>}
      </div>
    </div>
  );
}
