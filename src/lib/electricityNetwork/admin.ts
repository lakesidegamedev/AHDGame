import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { withNoStore } from "@/lib/api/withNoStore";
import { createAdminLog } from "@/lib/adminLog";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { getGameStateCollection } from "@/lib/db/collections/gameState";
import { producerEconomyTurnsCollection } from "@/lib/db/repositories/producerEconomyTurns";
import { statesCollection } from "@/lib/db/repositories/states";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { electricityMode } from "./rules/types";
import type { ElectricityReport } from "./rules/report";
import { buildElectricityNetwork } from "./rules/network";
const modeSchema = z.object({ mode: z.enum(["off", "shadow", "enforced"]) }).strict();
const querySchema = z.object({ turn: z.coerce.number().int().nonnegative().optional() }).strict();
export const GET = withNoStore(async () => {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const db = await getDb();
    const config = await gameConfigCollection(db).findOne(
      { _id: "default" },
      { projection: { electricityNetworkMode: 1 } }
    );
    const state = await (
      await getGameStateCollection(db)
    ).findOne({ _id: "current" }, { projection: { currentYear: 1, currentTurn: 1 } });
    const mode = electricityMode(config);
    return NextResponse.json({
      mode,
      turn: state?.currentTurn ?? 0,
      network: buildElectricityNetwork(state?.currentYear ?? 2027, mode),
    });
  } catch (error) {
    return handleRouteError(error);
  }
});
export const PATCH = withNoStore(async (request: Request) => {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const parsed = await parseJsonBody(request, modeSchema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);
    const db = await getDb();
    const mode = parsed.data.mode;
    await gameConfigCollection(db).updateOne(
      { _id: "default" },
      { $set: { electricityNetworkMode: mode } },
      { upsert: true }
    );
    await createAdminLog({
      category: "system",
      action: "electricity_network_mode_changed",
      username: auth.admin.username,
      adminUsername: auth.admin.username,
      details: `Electricity network mode set to ${mode}. Applies to the next unfrozen producer settlement; interrupted turns retain their frozen network.`,
    });
    return NextResponse.json({ success: true, mode });
  } catch (error) {
    return handleRouteError(error);
  }
});
interface ReportRecord {
  _id: string;
  worldEpoch: string;
  turn: number;
  status: string;
  electricityReport?: ElectricityReport;
}
export const REPORTS = withNoStore(async (request: Request) => {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return errorResponse(400, "Invalid report query.");
    const db = await getDb();
    const state = await (
      await getGameStateCollection(db)
    ).findOne({ _id: "current" }, { projection: { currentTurn: 1, worldEpochId: 1 } });
    if (!state?.worldEpochId) return NextResponse.json({ reports: [], companies: [], states: [] });
    const reports = await producerEconomyTurnsCollection<ReportRecord>(db)
      .find(
        {
          worldEpoch: state.worldEpochId,
          status: "settled",
          turn:
            parsed.data.turn === undefined
              ? { $lte: state.currentTurn }
              : { $eq: parsed.data.turn, $lte: state.currentTurn },
          electricityReport: { $exists: true },
        },
        { projection: { turn: 1, electricityReport: 1 } }
      )
      .sort({ turn: -1 })
      .limit(parsed.data.turn === undefined ? 12 : 1)
      .toArray();
    const ids = [
      ...new Set(
        reports.flatMap((r) => r.electricityReport?.companies.map((c) => c.corporationId) ?? [])
      ),
    ];
    const companies = ids.length
      ? await corporationsCollection(db)
          .find(
            { _id: { $in: ids.filter(ObjectId.isValid).map((id) => new ObjectId(id)) } },
            { projection: { name: 1 } }
          )
          .toArray()
      : [];
    const stateIds = [
      ...new Set(
        reports
          .flatMap((r) => [
            ...(r.electricityReport?.sites.map((s) => s.stateId) ?? []),
            ...(r.electricityReport?.routes.flatMap((r) => [r.fromState, r.toState]) ?? []),
          ])
          .filter(Boolean)
      ),
    ];
    const states = stateIds.length
      ? await statesCollection(db)
          .find({ _id: { $in: stateIds } }, { projection: { name: 1, countryId: 1 } })
          .toArray()
      : [];
    return NextResponse.json({
      states: states.map((s) => ({ id: s._id, name: s.name, countryId: s.countryId })),
      reports: reports.map((r) => ({ turn: r.turn, report: r.electricityReport })),
      companies: companies.map((c) => ({ id: c._id.toHexString(), name: c.name })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
});
