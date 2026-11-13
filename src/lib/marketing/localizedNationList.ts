/**
 * Country names and lists in the reader's language, for translated marketing copy.
 *
 * `formatNationList` in `marketedWorld.ts` builds an English list, which reads
 * wrong inside a German sentence. This uses the platform's own region names and
 * list rules instead. Era names the platform cannot know ("Soviet Union",
 * "East Germany") keep their authored English form rather than a modern
 * translation that would name the wrong state.
 */
import type { MarketedNation } from "./marketedWorld";

/** Game country ids that are not ISO 3166 region codes. */
const ISO_REGION_FOR_ID: Readonly<Record<string, string>> = { UK: "GB" };

function regionCode(id: string): string | null {
  const code = ISO_REGION_FOR_ID[id] ?? id;
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

function regionName(locale: string, code: string): string | null {
  try {
    const name = new Intl.DisplayNames([locale], { type: "region", fallback: "none" }).of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

export function localizedNationName(nation: MarketedNation, locale: string): string {
  if (locale === "en" || locale.startsWith("en-")) return nation.name;
  const code = regionCode(nation.id);
  if (!code) return nation.name;
  // Only translate when the authored name is the modern one; an era name stays as written.
  if (regionName("en", code) !== nation.name) return nation.name;
  return regionName(locale, code) ?? nation.name;
}

/** "Vereinigte Staaten und Kanada"; "United States and Canada". */
export function formatNationListForLocale(
  nations: readonly MarketedNation[],
  locale: string,
  type: "conjunction" | "disjunction" = "conjunction"
): string {
  const names = nations.map((n) => localizedNationName(n, locale));
  try {
    return new Intl.ListFormat([locale], { type, style: "long" }).format(names);
  } catch {
    return names.join(", ");
  }
}
