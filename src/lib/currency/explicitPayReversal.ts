import type { Db } from "mongodb";
import { reverseExplicitPayConversion, type ExplicitPayConversion } from "./autoConvert";
import { refundOrCapture } from "@/lib/observability/context";

/**
 * {@link reverseExplicitPayConversion} for purchase failure paths: an undo that
 * cannot land leaves the player holding the converted currency, so it is
 * captured at fatal level instead of being swallowed. Never throws.
 */
export async function reverseExplicitPayConversionOrCapture(
  db: Db,
  conversion: ExplicitPayConversion | undefined,
  component: string
): Promise<void> {
  if (!conversion) return;
  await refundOrCapture(
    async () => {
      if (!(await reverseExplicitPayConversion(db, conversion)))
        throw new Error("Converted balance no longer available to reverse");
    },
    {
      tags: { component, failure_kind: "explicit_pay_reversal" },
      extra: {
        characterId: conversion.characterId.toString(),
        payCurrency: conversion.payCurrency,
        requiredCurrency: conversion.requiredCurrency,
        paid: conversion.paid,
        received: conversion.received,
      },
    }
  );
}
