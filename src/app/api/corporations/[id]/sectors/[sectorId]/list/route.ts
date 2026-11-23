import {
  listSectorForSale,
  quoteSectorForSale,
} from "@/lib/corporations/commands/sectorOperations/listSectorForSale";

interface RouteParams {
  params: Promise<{ id: string; sectorId: string }>;
}

// GET /api/corporations/[id]/sectors/[sectorId]/list — Quote the listing price. Auth: requireBasicAuth, CEO only.
export async function GET(request: Request, { params }: RouteParams) {
  return quoteSectorForSale(request, { params });
}

// POST /api/corporations/[id]/sectors/[sectorId]/list — List a sector for sale on the secondary market.
// Auth: requireBasicAuth
// Errors: 400, 403, 404
export async function POST(request: Request, { params }: RouteParams) {
  return listSectorForSale(request, { params });
}
