"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BlendSelect } from "@/components/blend/BlendControls";
import { useCountryDisplayName, useEnabledCountries } from "@/contexts/RegisteredCountriesContext";
import type { CountryId } from "@/lib/constants/countriesCore";
import { campaignManagerHref } from "@/lib/campaignManager/links";
import { EYEBROW } from "../ui";

/**
 * The country whose races Campaign Manager shows. Any playable country can be
 * viewed; choosing one reloads the page for it, so the race types, regions and
 * map follow. Entering a race stays limited to the player's home region.
 */
export function CountryPicker({ countryId }: { countryId: string }) {
  const t = useTranslations("elections.campaignManager.finder");
  const router = useRouter();
  const countries = useEnabledCountries();
  const nameOf = useCountryDisplayName();
  const options = countries.includes(countryId as CountryId)
    ? countries
    : [countryId as CountryId, ...countries];
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={EYEBROW}>{t("country")}</span>
      <BlendSelect
        aria-label={t("country")}
        value={countryId}
        onChange={(e) => {
          if (e.target.value !== countryId) {
            router.push(campaignManagerHref({ country: e.target.value }));
          }
        }}
      >
        {options.map((id) => (
          <option key={id} value={id}>
            {nameOf(id)}
          </option>
        ))}
      </BlendSelect>
    </label>
  );
}
