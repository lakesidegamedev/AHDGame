import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { computeDerivedComposition } from "@/lib/positionEditor/preview";
import { SEED_ERA_IDS } from "@/lib/seeds/presetSelector";
import type { EditorStateConfig } from "@/lib/positionEditor/types";

const MAX_CONFIGS = 80;

const entrySchema = z.object({
  share: z.number().finite(),
  turnout: z.number().finite(),
  economicLean: z.number().finite(),
  socialLean: z.number().finite(),
  base: z
    .object({
      share: z.number().finite(),
      economicLean: z.number().finite(),
      socialLean: z.number().finite(),
      turnout: z.number().finite(),
    })
    .optional(),
});

const configSchema = z.object({
  era: z.enum(SEED_ERA_IDS),
  countryId: z.string().min(1).max(8),
  stateId: z.string().min(1).max(32),
  dims: z.array(z.string().max(32)).max(16),
  layer1: z.record(z.string(), z.record(z.string(), entrySchema)),
});

const bodySchema = z.object({ configs: z.array(configSchema).min(1).max(MAX_CONFIGS) });

// POST /api/admin/position-editor/preview — census preview of edited editor configs.
// Auth: requireAdmin
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonBody(request, bodySchema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);

    const derived = parsed.data.configs.map((config) =>
      computeDerivedComposition(config as EditorStateConfig)
    );
    return NextResponse.json({ derived });
  } catch (error) {
    return handleRouteError(error);
  }
}
