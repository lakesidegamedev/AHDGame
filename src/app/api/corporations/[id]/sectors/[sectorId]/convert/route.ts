import { convertSectorIndustry } from "@/lib/corporations/commands/sectorOperations/convertSectorIndustry";

interface RouteParams {
  params: Promise<{ id: string; sectorId: string }>;
}

// POST /api/corporations/[id]/sectors/[sectorId]/convert — Convert an over-built sector to another industry during the market transition.
// Auth: requireBasicAuth
// Errors: 400, 403, 404, 409
export async function POST(request: Request, { params }: RouteParams) {
  return convertSectorIndustry(request, { params });
}
