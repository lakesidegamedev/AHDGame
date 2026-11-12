import type { BriefAction, BriefKind } from "@/lib/country/background/rules/countryBriefs";

/** One posted background country brief (`countryBriefs`). */
export interface CountryBrief {
  /** `${countryId}:${kind}:${turn}`, so a retried turn posts it once. */
  _id: string;
  countryId: string;
  kind: BriefKind;
  turn: number;
  headline: string;
  body: string;
  actions: BriefAction[];
  createdAt: Date;
}
