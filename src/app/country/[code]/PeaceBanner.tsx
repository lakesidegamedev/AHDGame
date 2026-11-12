import Link from "next/link";
import type { CountryPeaceNotice } from "@/lib/military/countryPeaceNotice";

/**
 * Strip announcing a pending peace decision, rendered under the wartime strip
 * on every page of this country.
 *
 * Stacked rather than replacing the war strip: a country can be at war and
 * holding an offer at once. Lives in the country layout because a pending
 * settlement is a fact about the country, not the tab being viewed.
 *
 * Seat gated: `loadCountryPeaceNotice` returns null for readers who cannot act,
 * so this never renders for someone who could not take the decision.
 *
 * Tone: `warning` for a won war on a clock, `info` for offers and invitations.
 */
export function PeaceBanner({
  notice,
  countryName,
}: {
  notice: CountryPeaceNotice;
  countryName: string;
}) {
  const { href, label, sentence, tone } = describe(notice, countryName);
  const palette =
    tone === "urgent"
      ? "border-warning/30 bg-warning/10 text-warning"
      : "border-info/30 bg-info/10 text-info";

  return (
    <div className={`border-b px-4 py-2 text-center text-sm ${palette}`}>
      <span>{sentence} </span>
      <Link href={href} className="font-semibold underline underline-offset-2 hover:opacity-80">
        {label}
      </Link>
    </div>
  );
}

function describe(
  notice: CountryPeaceNotice,
  countryName: string
): { href: string; label: string; sentence: string; tone: "urgent" | "info" } {
  if (notice.kind === "window_open") {
    // Links to the war record, where the terms are chosen, rather than to the peace
    // panel: imposing is not negotiating and does not happen in the same place.
    const href =
      notice.conflictNumber !== null
        ? `/world/conflicts/${notice.conflictNumber}`
        : "/world/crises?view=conflicts";
    return {
      href,
      label: "Name your terms",
      sentence:
        `${countryName} has won ${notice.warName} and may impose terms. ` +
        `This closes in ${notice.turnsLeft} ${notice.turnsLeft === 1 ? "turn" : "turns"}.`,
      tone: "urgent",
    };
  }

  if (notice.kind === "offer_incoming") {
    return {
      // Resolved server-side from WHICH seat authorized this reader: the head of
      // government and the foreign minister act on different surfaces.
      href: notice.href,
      label: "Review the terms",
      sentence:
        notice.count > 1
          ? `${notice.count} peace offers are waiting on ${countryName}.`
          : `Peace terms have been offered to ${countryName}.`,
      tone: "info",
    };
  }

  return {
    href: notice.href,
    label: "Offer terms",
    sentence: `${countryName} can open peace talks in this war.`,
    tone: "info",
  };
}
