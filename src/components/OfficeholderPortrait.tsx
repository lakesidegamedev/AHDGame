import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/Avatar";

export interface PortraitHolder {
  name: string;
  avatarUrl?: string | null;
  href?: string;
  borderKey?: string | null;
  tintColor?: string | null;
}

export function OfficeholderPortrait({
  holder,
  role,
  detail,
  compact = false,
  vacancyLabel = "Vacant",
}: {
  holder: PortraitHolder | null;
  role?: ReactNode;
  detail?: string;
  compact?: boolean;
  vacancyLabel?: string;
}) {
  const aperture = compact ? "h-8 w-8" : "aspect-square h-auto w-20 max-w-full sm:w-24";
  const layout = compact
    ? "flex items-center gap-2"
    : "grid justify-items-center gap-2 text-center";
  const portrait = (
    <div
      aria-hidden="true"
      className={`max-w-full shrink-0 rounded-xl border p-1 ${
        holder
          ? "border-card-border bg-card-elevated shadow-sm ring-1 ring-inset ring-card-border"
          : "border-dashed border-card-border bg-card-muted"
      }`}
    >
      {holder ? (
        <Avatar
          name={holder.name}
          url={holder.avatarUrl}
          size={aperture}
          borderKey={holder.borderKey}
          tintColor={holder.tintColor}
          className={compact ? "" : "text-heading"}
        />
      ) : (
        <div className={aperture} />
      )}
    </div>
  );
  const caption = (
    <div className="min-w-0 max-w-full wrap-anywhere leading-snug">
      {role && <div className="text-body-sm font-medium text-muted">{role}</div>}
      <div className={holder ? "font-semibold text-foreground" : "italic text-muted"}>
        {holder?.name ?? vacancyLabel}
      </div>
      {detail && <div className="text-body-sm text-muted">{detail}</div>}
    </div>
  );

  return holder?.href ? (
    <Link
      href={holder.href}
      className={`${layout} min-w-0 rounded-lg hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
    >
      {portrait}
      {caption}
    </Link>
  ) : (
    <div className={`${layout} min-w-0`}>
      {portrait}
      {caption}
    </div>
  );
}
