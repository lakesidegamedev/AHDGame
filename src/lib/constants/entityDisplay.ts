import { ROSTER_BY_KEY, type AlignmentCountryKey } from "@/lib/constants/alignmentRoster";
import { type CountryId } from "@/lib/constants/countriesCore";
import { COUNTRY_DISPLAY_LABELS } from "@/lib/constants/countryDisplayLabels";
import type { OrgMemberId } from "@/lib/db/types/internationalOrganization";
import { successorPolityName } from "@/lib/world/successorPolities";

/**
 * Display name and flag for any organisation member (or any world entity).
 *
 * Membership is open to every entity in the game, so a member may have no
 * CountryConfig at all. The alignment roster names every entity the world
 * models; two-letter ISO 3166-1 keys encode as regional-indicator flag emoji
 * so Canada, the Benelux, and other seated-but-unplayable allies render a real
 * flag rather than the white placeholder. The id itself is the last-resort name
 * so a row can never render blank.
 */

const REGIONAL_INDICATOR_A = 0x1f1e6;

/** Entity ids that differ from the ISO code their flag uses. */
const ISO_ALPHA2_BY_ENTITY: Readonly<Record<string, string>> = { CZ2: "CZ" };

function isoAlpha2ToFlag(code: string): string {
  return String.fromCodePoint(
    REGIONAL_INDICATOR_A + (code.charCodeAt(0) - 65),
    REGIONAL_INDICATOR_A + (code.charCodeAt(1) - 65)
  );
}

export function entityName(id: OrgMemberId): string {
  return (
    COUNTRY_DISPLAY_LABELS[id as CountryId]?.name ??
    ROSTER_BY_KEY[id as AlignmentCountryKey]?.name ??
    successorPolityName(id) ??
    id
  );
}

/**
 * Flag emoji for an entity. Playable countries keep their authored emoji
 * (era-correct: the Soviet Union is not 🇷🇺). Everyone else with a two-letter
 * ISO key gets the matching regional-indicator pair; three-letter historical
 * ids (NVN, SVN, …) still fall back to the white flag.
 */
export function entityFlag(id: OrgMemberId): string {
  const authored = COUNTRY_DISPLAY_LABELS[id as CountryId]?.flagEmoji;
  if (authored) return authored;
  const iso = ISO_ALPHA2_BY_ENTITY[id] ?? id;
  if (/^[A-Z]{2}$/.test(iso)) return isoAlpha2ToFlag(iso);
  return "🏳️";
}
