/**
 * Electorate priority edits. priorityTargetSchema limits edits to US, UK and JP;
 * priorityUpdateSchema requires one primary and exactly three secondary law levels.
 */
import { z } from "zod";

export const priorityTargetSchema = z
  .object({
    countryId: z.enum(["US", "UK", "JP"]),
    regionId: z.string().trim().min(1).max(12).toUpperCase(),
    bucketId: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z_]+:[a-z_]+$/),
  })
  .strict();

const referenceSchema = z
  .object({
    lawTypeId: z.string().min(1).max(128),
    policyOptionId: z.string().min(1).max(128),
  })
  .strict();

export const priorityUpdateSchema = priorityTargetSchema.extend({
  priorities: z
    .object({
      primary: referenceSchema,
      secondary: z.tuple([referenceSchema, referenceSchema, referenceSchema]),
    })
    .strict(),
});

export type PriorityTarget = z.infer<typeof priorityTargetSchema>;
