import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { publicApiGuard } from "@/lib/publicApi/middleware";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import type { Document } from "mongodb";

// GET /api/public/v1/market?type=SECTOR&country=CODE&page=N&view=share|unowned
export async function GET(request: Request) {
  try {
    const guard = await publicApiGuard(request, "market");
    if (!guard.ok) return guard.response;

    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    const country = url.searchParams.get("country") ?? undefined;
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const view = url.searchParams.get("view") ?? "share";

    if (!type) {
      return errorResponse(400, "type is required", { code: "BAD_REQUEST", extra: { ok: false } });
    }

    // `unowned` listed stored market cells, which no longer exist. The request
    // stays valid for existing integrations and answers with an empty list.
    if (view === "unowned") {
      return NextResponse.json(
        {
          ok: true,
          found: false,
          mode: "unowned",
          deprecated:
            "view=unowned is retired: markets are entered by building, so there is no unowned list. Use view=share.",
          sectorType: type,
          page,
          totalPages: 0,
          totalItems: 0,
          sectors: [],
        },
        { headers: guard.headers }
      );
    }

    const db = await getDb();
    const query: Record<string, unknown> = { sectorType: type };
    if (country) query.countryId = country;

    const [companies, total] = await Promise.all([
      corporateSectorsCollection<Document>(db)
        .find(query)
        .skip((page - 1) * 20)
        .limit(20)
        .toArray(),
      corporateSectorsCollection<Document>(db).countDocuments(query),
    ]);
    return NextResponse.json({
      ok: true,
      found: companies.length > 0,
      mode: "share",
      sectorType: type,
      page,
      totalPages: Math.ceil(total / 20),
      totalItems: total,
      companies,
    }, { headers: guard.headers });
  } catch (error) {
    return handleRouteError(error);
  }
}
