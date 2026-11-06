import type { Corporation } from "@/lib/db/types";

/**
 * The slice of a rival corporation the market-position panel needs: enough to
 * name and colour it, plus the two fields that decide whether it is player-owned
 * or part of the NPP field.
 */
export type SiblingCorpProjection = Pick<
  Corporation,
  | "_id"
  | "name"
  | "sequentialId"
  | "brandColor"
  | "countryId"
  | "liquidCurrencyCode"
  | "ceoType"
  | "caretakerCeo"
  | "marketingStrength"
>;
