import { z } from "zod";
import { ZOD_CURRENCY_ENUM } from "@/lib/constants/currencies";

export const subscribeIndexFundSchema = z.object({
  corporationId: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/)
    .optional(),
  operationId: z.string().uuid(),
  units: z.number().int().min(1),
  /** Optional: which currency wallet to debit from (defaults to auto-convert from home). */
  payCurrency: z.enum(ZOD_CURRENCY_ENUM).optional(),
  /** Corporate subscriptions: the CEO confirmed spending below the operating reserve. */
  overrideOperatingReserve: z.literal(true).optional(),
});
