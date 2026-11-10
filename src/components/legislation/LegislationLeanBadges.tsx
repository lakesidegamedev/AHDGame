"use client";

import { PositionBadges } from "@/components/PositionBadges";
import type { CountryId } from "@/lib/constants/countriesCore";
import { v2VotePosition } from "@/lib/resetLegislation/rules/politicalPositions";
import type { LawChoice } from "@/lib/resetLegislation/rules/eligibility";
import { taxSliderNpcEconomic } from "@/lib/resetLegislation/rules/taxPosition";

/** Economic and social lean of one policy option, as NPPs vote on it. */
export function OptionLeanBadges(props: {
  familyId: string;
  choice: LawChoice;
  countryId: CountryId;
  className?: string;
}) {
  return (
    <PositionBadges
      {...v2VotePosition({ familyId: props.familyId, choice: props.choice })}
      countryId={props.countryId}
      align="items-start"
      className={props.className}
    />
  );
}

/** Economic lean of moving a tax from its current rate to the proposed one. */
export function TaxLeanBadges(props: {
  estimate: Parameters<typeof taxSliderNpcEconomic>[0] & { currentRate: number };
  rate: number;
  countryId: CountryId;
  className?: string;
}) {
  return (
    <PositionBadges
      economic={taxSliderNpcEconomic(props.estimate, props.estimate.currentRate, props.rate)}
      countryId={props.countryId}
      align="items-start"
      className={props.className}
    />
  );
}
