import { withAdminRoute } from "@/lib/api/withAdminAuth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { createAdminLog } from "@/lib/adminLog";
import { getCurrentTurn } from "@/lib/currentTurn";
import type { GameConfig } from "@/lib/db/types";
import { getMarketSystemModeForDb, marketAtLeast } from "@/lib/market/featureFlag";
import {
  economicInterventionPlanSchema,
  validateInterventionActivation,
} from "@/lib/economy/interventionGovernance";

const patchSchema = z.object({
  mode: z.enum(["shadow", "active"]),
  intervention: economicInterventionPlanSchema.optional(),
});

type FreightSettlementMode = "shadow" | "active";

function resolveMode(value: unknown): FreightSettlementMode {
  return value === "active" ? "active" : "shadow";
}

// GET /api/admin/config/freight-settlement - Freight settlement rollout mode
// Auth: requireAdmin
export const GET = withAdminRoute(async (_auth) => {
  const db = await getDb();
  const config = await db
    .collection<GameConfig>("gameConfig")
    .findOne({ _id: "default" }, { projection: { freightSettlementMode: 1 } });

  return NextResponse.json({ mode: resolveMode(config?.freightSettlementMode) });
});

// PATCH /api/admin/config/freight-settlement - Set the freight settlement rollout
// Auth: requireAdmin
// Errors: 400, 403, 409
export const PATCH = withAdminRoute(async (auth, request: Request) => {
  const parsed = await parseJsonBody(request, patchSchema);
  if (!parsed.success) {
    return errorResponse(parsed.status, parsed.error);
  }

  const { mode, intervention } = parsed.data;
  const db = await getDb();
  const gameConfig = db.collection<GameConfig>("gameConfig");
  const priorConfig = await gameConfig.findOne(
    { _id: "default" },
    { projection: { freightSettlementMode: 1 } }
  );
  const priorMode = resolveMode(priorConfig?.freightSettlementMode);
  const marketSystemMode = await getMarketSystemModeForDb(db);

  // Active settlement changes the next corporation turn's physical input
  // availability. Throughput begins at clearing, so refuse a configuration
  // that would look live but have no economic effect.
  if (mode === "active" && !marketAtLeast(marketSystemMode, "clearing")) {
    return errorResponse(409, "Freight settlement requires market system mode clearing or higher.");
  }

  const currentTurn = await getCurrentTurn(db);
  if (mode === "active") {
    if (!intervention) {
      return errorResponse(
        400,
        "An economic intervention plan is required to activate freight settlement."
      );
    }
    const activationError = validateInterventionActivation(intervention, currentTurn);
    if (activationError) {
      return errorResponse(400, activationError);
    }
  }
  const changedAt = new Date().toISOString();
  await gameConfig.updateOne(
    { _id: "default" },
    {
      $set: {
        freightSettlementMode: mode,
        freightSettlementModeUpdatedBy: auth.admin.username,
        freightSettlementModeUpdatedAt: changedAt,
        freightSettlementModeUpdatedTurn: currentTurn,
        ...(mode === "active" && intervention
          ? { freightSettlementIntervention: intervention }
          : {}),
      },
    },
    { upsert: true }
  );

  await createAdminLog({
    category: "system",
    action: mode === "active" ? "freight_settlement_activated" : "freight_settlement_shadowed",
    username: auth.admin.username,
    adminUsername: auth.admin.username,
    details:
      mode === "active"
        ? `Freight settlement activated (was "${priorMode}") at turn ${currentTurn}. Next corporation turn uses lagged delivered input availability.`
        : `Freight settlement set to shadow (was "${priorMode}") at turn ${currentTurn}. Routes remain observable with no plant-input effect.`,
  });

  return NextResponse.json({ success: true, mode, priorMode, currentTurn });
});
