import { bulkBuildCapacity } from "@/lib/corporations/commands/sectorOperations/bulkBuildCapacity";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/corporations/[id]/sectors/bulk-build: preview or place capacity
// builds across up to 50 sectors, each through the single-sector build path.
// Auth: requireBasicAuth (CEO only). Errors: 400, 403, 404, 429.
export async function POST(request: Request, { params }: RouteParams) {
  return bulkBuildCapacity(request, { params });
}
