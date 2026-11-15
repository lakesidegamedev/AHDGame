import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { adminDemographicsPostSchema } from "@/lib/api/schemas/admin";
import type { StateDemographics, AdminLog } from "@/lib/db/types";
import { stateDemographicsCollection } from "@/lib/db/repositories/stateDemographics";
import { adminLogsCollection } from "@/lib/db/repositories/adminLogs";
import { demographicDefaultsCollection } from "@/lib/db/repositories/demographicDefaults";

// GET /api/admin/demographics — Returns one state's stored demographics (state query param).
// Auth: requireAdmin
// Errors: 403
export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const stateId = searchParams.get("state");

    const db = await getDb();

    let stateDemographics: StateDemographics | null = null;
    if (stateId) {
      stateDemographics = await stateDemographicsCollection(db).findOne({
        _id: stateId.toUpperCase(),
      });
    }

    return NextResponse.json({ stateDemographics });
  } catch (error) {
    return handleRouteError(error);
  }
}

// There is no PATCH: `categoryWeights` is derived from the seeds and the Layer-1
// census, so a hand edit could only put a region out of step with the substrate
// the vote engine reads. Use Reseed Demographics (POST /api/admin/demographics/reseed).

// POST /api/admin/demographics — Overwrites the demographic defaults collection with the current live state demographics.
// Auth: requireAdmin
// Errors: 400, 403
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const parsed = await parseJsonBody(request, adminDemographicsPostSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }

    const db = await getDb();

    // Get all current state demographics
    const currentDemographics = await stateDemographicsCollection(db).find({}).toArray();

    if (currentDemographics.length === 0) {
      return errorResponse(400, "No demographics data found to save as defaults");
    }

    // Clear existing defaults and insert current values
    await demographicDefaultsCollection(db).deleteMany({});

    for (const demo of currentDemographics) {
      await demographicDefaultsCollection(db).insertOne({
        _id: demo._id,
        countryId: demo.countryId,
        categoryWeights: demo.categoryWeights,
        lastUpdated: new Date(),
      } as StateDemographics);
    }

    // Log the action
    await adminLogsCollection(db).insertOne({
      category: "system",
      action: "demographics_defaults_overwritten",
      username: "SYSTEM",
      adminUsername: admin.username,
      details: `Default demographics overwritten with current values (${currentDemographics.length} states)`,
      createdAt: new Date(),
    } as AdminLog);

    return NextResponse.json({
      success: true,
      message: `Default demographics saved for ${currentDemographics.length} states`,
      statesUpdated: currentDemographics.length,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
