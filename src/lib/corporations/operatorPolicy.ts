import { z } from "zod";
import { OPERATING_SECTOR_TYPES } from "@/lib/constants/corporations";
import type { CorporationOperatorPolicy } from "@/lib/db/types/corporation";
import { OPERATOR_ACTIONS } from "@/lib/turn/npp/rules/operatorPolicy";

const permission = z.enum(["allow", "ask", "never"]);

/** Request body for setting a corporation's operator policy. */
export const operatorPolicyInputSchema = z
  .object({
    actions: z
      .partialRecord(z.enum(OPERATOR_ACTIONS as [string, ...string[]]), permission)
      .optional(),
    sectorTypes: z
      .array(z.enum(OPERATING_SECTOR_TYPES))
      .max(OPERATING_SECTOR_TYPES.length)
      .optional(),
    countryIds: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .max(40)
      .optional(),
  })
  .strict();

export type OperatorPolicyInput = z.infer<typeof operatorPolicyInputSchema>;

/** Normalize a validated body into the stored document: deduplicated, empty lists dropped. */
export function buildOperatorPolicy(
  input: OperatorPolicyInput,
  turn: number
): CorporationOperatorPolicy {
  const actions = Object.fromEntries(
    Object.entries(input.actions ?? {}).filter(([, value]) => value != null)
  ) as CorporationOperatorPolicy["actions"];
  const unique = (values: readonly string[] | undefined) =>
    values && values.length > 0 ? [...new Set(values)] : undefined;
  return {
    ...(actions && Object.keys(actions).length > 0 ? { actions } : {}),
    ...(unique(input.sectorTypes) ? { sectorTypes: unique(input.sectorTypes) } : {}),
    ...(unique(input.countryIds) ? { countryIds: unique(input.countryIds) } : {}),
    setTurn: turn,
  };
}
