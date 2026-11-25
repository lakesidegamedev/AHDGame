import Link from "next/link";
import { pillClass } from "@/components/ui/selectedState";

const ROLES: { id: string; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "pm", label: "Prime minister" },
  { id: "leader", label: "Party leader" },
  { id: "player", label: "Player" },
  { id: "spectator", label: "Spectator" },
];

/**
 * Admin-only "Viewing as" segmented control — a row of links that set `?as=`.
 * The page reads `?as` and passes the role into the rail; the backend still
 * authorizes every action, so this only changes which module renders.
 */
export function ViewingAsControl({
  active,
  hrefFor,
}: {
  active: string;
  hrefFor: (role: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-body-sm font-bold uppercase tracking-wider text-[var(--ref-gold)]">
        Viewing as
      </span>
      {ROLES.map((r) => (
        <Link
          key={r.id}
          href={hrefFor(r.id)}
          aria-current={active === r.id ? "true" : undefined}
          className={`px-2.5 py-1 text-body-sm ${pillClass(active === r.id)}`}
        >
          {r.label}
        </Link>
      ))}
    </div>
  );
}
