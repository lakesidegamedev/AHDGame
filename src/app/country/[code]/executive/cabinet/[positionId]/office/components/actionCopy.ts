"use client";

import { type CountryId } from "@/lib/constants/countriesCore";
import { COUNTRY_CLIENT_CONFIGS } from "@/lib/constants/countryClientConfig";

interface ActionCopy {
  singular: string;
  plural: string;
  title: string;
}

const MINISTERIAL_COPY: ActionCopy = {
  singular: "ministerial action",
  plural: "ministerial actions",
  title: "Ministerial Actions",
};

const CABINET_COPY: ActionCopy = {
  singular: "cabinet action",
  plural: "cabinet actions",
  title: "Cabinet Actions",
};

export function getCabinetActionCopy(countryCodeOrId: string): ActionCopy {
  const countryId = countryCodeOrId.toUpperCase() as CountryId;
  const config = COUNTRY_CLIENT_CONFIGS[countryId];
  if (config?.governmentType === "presidential") return CABINET_COPY;
  return MINISTERIAL_COPY;
}
