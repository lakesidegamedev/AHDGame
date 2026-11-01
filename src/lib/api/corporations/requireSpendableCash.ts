import { errorResponse } from "@/lib/api/errors";
import { corporateCashEncumbered } from "@/lib/corporations/rules/discretionaryCash";

/** Optional actions cannot precede current withholding or outstanding payables. */
export function requireSpendableCorporateCash(
  input: Parameters<typeof corporateCashEncumbered>[0]
) {
  return corporateCashEncumbered(input)
    ? errorResponse(
        409,
        "Corporate taxes and operating payables must settle before optional spending."
      )
    : null;
}
