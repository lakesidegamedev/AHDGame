import Link from "next/link";
import type { CountryWarNotice } from "@/lib/military/countryAtWar";

/**
 * Strip under the navbar on every page of a country at war.
 *
 * Lives in the country layout so no future page can forget it: war is a fact
 * about the country, not the tab. Error colour, since it describes the
 * country rather than the viewer's access.
 *
 * Wording depends on what is true: a belligerent is at war, an occupied
 * neutral is not at peace. One war links to its record; several link to the
 * conflicts board to avoid arbitrarily featuring one.
 */
export function WartimeBanner({ notice }: { notice: CountryWarNotice }) {
  const href =
    notice.conflictNumber !== null
      ? `/world/conflicts/${notice.conflictNumber}`
      : "/world/crises?view=conflicts";

  return (
    <div className="border-b border-error/30 bg-error/10 px-4 py-2 text-center text-sm text-error">
      <span>{sentence(notice)} </span>
      <Link href={href} className="font-semibold underline underline-offset-2 hover:opacity-80">
        {notice.conflictNumber !== null ? "See the war" : "See the conflicts"}
      </Link>
    </div>
  );
}

function sentence(notice: CountryWarNotice): string {
  if (notice.count > 1) {
    return notice.hostOnly
      ? `${notice.count} armed conflicts are being fought on this country's territory.`
      : `This country is currently involved in ${notice.count} armed conflicts.`;
  }
  // A named war reads better than the generic line, and the name is already public
  // on the conflicts board. A colon, not a dash: this is player-facing copy and the
  // project bars em and en dashes there.
  const named = notice.name ? `: ${notice.name}` : "";
  return notice.hostOnly
    ? `An armed conflict is being fought on this country's territory${named}.`
    : `This country is currently involved in an armed conflict${named}.`;
}
