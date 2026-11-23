import { formatFundsCompact } from "@/lib/utils/formattersCore";

/**
 * A bond rule limit is set in the anchor currency. Show it as set, with the
 * converted amount beside it, since the converted figure moves with the
 * exchange rate while the rule does not.
 */
export function anchorRuleText(anchorAmount: number, converted: string): string {
  return `${formatFundsCompact(anchorAmount, "₳")}, about ${converted} at today's rate`;
}

export const ANCHOR_RULE_RATE_NOTE =
  "Limits are set in anchor currency (₳). The converted amount moves with the exchange rate.";
