import { handleExecutiveOverview } from "@/lib/country/executiveOverview";

// GET /api/country/[code]/executive — Executive data by country (presidential, US, parliamentary).
// Auth: optional
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  return handleExecutiveOverview(request, { params });
}
