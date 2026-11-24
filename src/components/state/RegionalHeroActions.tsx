import Link from "next/link";

/** Keep navigation outside the hero's horizontally scrolling facts. */
export function RegionalHeroActions({
  officeHref,
  legislature,
}: {
  officeHref: string | null;
  legislature?: { href: string; label: string } | null;
}) {
  if (!officeHref && !legislature) return null;
  const buttonClass =
    "inline-flex max-w-full items-center justify-center rounded-lg border border-card-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background";
  return (
    <nav
      aria-label="Regional government"
      className="flex flex-wrap items-center gap-2 border-t border-card-border px-5 py-3 sm:px-6"
    >
      {/* A visible group label, so the buttons say where they lead. */}
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
        Regional government
      </span>
      {officeHref && (
        <Link href={officeHref} className={buttonClass}>
          Office
        </Link>
      )}
      {legislature && (
        <Link href={legislature.href} className={buttonClass}>
          {legislature.label}
        </Link>
      )}
    </nav>
  );
}
