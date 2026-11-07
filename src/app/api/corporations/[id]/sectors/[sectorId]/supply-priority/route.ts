import { setSectorSupplyPriority } from "@/lib/corporations/commands/sectorOperations/setSectorSupplyPriority";

interface RouteParams {
  params: Promise<{ id: string; sectorId: string }>;
}

// POST /api/corporations/[id]/sectors/[sectorId]/supply-priority — Sell outside buyers first.
// Auth: requireBasicAuth (CEO)
// Errors: 400, 403, 404
export async function POST(request: Request, { params }: RouteParams) {
  return setSectorSupplyPriority(request, { params });
}
