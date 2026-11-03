import type { useTranslations } from "next-intl";
import type { CountryId } from "@/lib/constants/countries";
import { formatElectionTypeLabel } from "@/lib/utils/electionLabels";
import type { CmRace } from "@/lib/campaignManager/rules";

type T = ReturnType<typeof useTranslations<"elections.campaignManager">>;

export function typeLabel(electionType: string, countryId: string): string {
  return formatElectionTypeLabel(electionType, countryId as CountryId);
}

/**
 * "Ohio Senate", "London Parliamentary", or "Ohio Governor · Party 1 primary".
 * A nationwide race (region "US", "UK", ...) drops the region.
 */
export function raceTitle(
  race: CmRace,
  t: T,
  countryId: string,
  regionNames: Record<string, string>
): string {
  const type = typeLabel(race.electionType, countryId);
  const base =
    race.regionId === countryId
      ? t("nationalTitle", { type })
      : t("raceTitle", { region: regionNames[race.regionId] ?? race.regionId, type });
  if (race.stage !== "primary") return base;
  const party = race.primaryPartyName ?? race.primaryPartyId ?? "";
  return `${base} · ${t("primarySuffix", { party })}`;
}
