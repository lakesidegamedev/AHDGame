import { z } from "zod";
import { CORPORATE_BOND_MATURITY_ISSUANCE_OPTIONS } from "@/lib/db/types/bond";
import { ZOD_CURRENCY_ENUM } from "@/lib/constants/currencies";

const CORPORATE_MATURITY_SET = new Set<number>(CORPORATE_BOND_MATURITY_ISSUANCE_OPTIONS);

export const issueBondSchema = z.object({
  /**
   * Total face value to issue. The handler enforces the minimum, which it lowers
   * for small corporations whose borrowing room is under the flat minimum.
   */
  faceValue: z.number().positive(),
  /** Maturity in turns: 96 (2yr), 240 (5yr), or 336 (7yr) */
  maturityTurns: z
    .number()
    .int()
    .refine(
      (v) => CORPORATE_MATURITY_SET.has(v),
      "Maturity must be 96 (2yr), 240 (5yr), or 336 (7yr)"
    ),
});

export const buyBondSchema = z.object({
  requestId: z.string().min(1).max(100).optional(),
  /** Number of bond units to buy (each unit = $1,000 face value) */
  units: z.number().int().positive("Must buy at least 1 unit"),
  /** Optional: which currency to deduct from (defaults to bond's required currency) */
  payCurrency: z.enum(ZOD_CURRENCY_ENUM).optional(),
});

export const sellBondSchema = z.object({
  requestId: z.string().min(1).max(100).optional(),
  /** Number of bond units to sell */
  units: z.number().int().positive("Must sell at least 1 unit"),
});
