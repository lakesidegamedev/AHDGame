"use client";

import { type CountryId } from "@/lib/constants/countriesCore";
import { COUNTRY_CLIENT_CONFIGS } from "@/lib/constants/countryClientConfig";
import { USLeadershipPanel } from "../leadership/USLeadershipPanel";
import { UKLeadershipPanel } from "../leadership/UKLeadershipPanel";

interface AdminLeadershipSectionProps {
  countryId: CountryId;
}

const UK_ID = COUNTRY_CLIENT_CONFIGS.UK.id;

export function AdminLeadershipSection({ countryId }: AdminLeadershipSectionProps) {
  if (countryId === UK_ID) return <UKLeadershipPanel />;
  return <USLeadershipPanel />;
}
