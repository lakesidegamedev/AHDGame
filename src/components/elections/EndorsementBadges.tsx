"use client";

import Link from "next/link";

/** One endorsement as the elections API sends it. */
export interface EndorsementChip {
  type: "npp" | "player";
  nppId?: string;
  nppName?: string;
  characterId?: string;
  characterName?: string;
}

/**
 * Endorsement chips for a candidate, linking each endorser. Shared by the
 * election page's candidate rows and Campaign Manager's candidate card.
 */
export function EndorsementBadges({ endorsements }: { endorsements: EndorsementChip[] }) {
  if (endorsements.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {endorsements.map((e, i) => {
        const label = e.type === "npp" ? e.nppName : e.characterName;
        const href =
          e.type === "npp"
            ? `/politicians/npp/${e.nppId}`
            : e.characterId
              ? `/character/${e.characterId}`
              : null;
        const tone =
          e.type === "npp"
            ? "text-yellow-400 hover:text-yellow-300"
            : "text-blue-400 hover:text-blue-300";
        const inner = (
          <>
            <svg className="h-2.5 w-2.5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            {label}
          </>
        );
        const cls = `flex items-center gap-0.5 text-[10px] transition-colors ${tone}`;
        return href ? (
          <Link key={`${label}-${i}`} href={href} className={cls} title={`Endorsed by ${label}`}>
            {inner}
          </Link>
        ) : (
          <span key={`${label}-${i}`} className={cls} title={`Endorsed by ${label}`}>
            {inner}
          </span>
        );
      })}
    </div>
  );
}
