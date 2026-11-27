import type { SupplyAgreement } from "@/lib/db/types/supplyAgreement";

/** A decision applies only to the exact terms its author or recipient reviewed. */
export function observedSupplyOffer(
  agreement: Pick<
    SupplyAgreement,
    | "currentOffer"
    | "volumeCap"
    | "pricePremium"
    | "priceMode"
    | "fixedUnitPrice"
    | "durationTurns"
    | "exclusive"
  >
): Record<string, unknown> {
  return Object.fromEntries(
    [
      "currentOffer",
      "volumeCap",
      "pricePremium",
      "priceMode",
      "fixedUnitPrice",
      "durationTurns",
      "exclusive",
    ].map((key) => [
      key,
      agreement[key as keyof typeof agreement] === undefined
        ? { $exists: false }
        : agreement[key as keyof typeof agreement],
    ])
  );
}
