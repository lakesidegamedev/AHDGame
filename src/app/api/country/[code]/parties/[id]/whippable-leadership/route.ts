import { handleWhippableLeadership } from "@/lib/partyWhips/whippableLeadership";

interface RouteParams {
  params: Promise<{ code: string; id: string }>;
}

// GET /api/country/[code]/parties/[id]/whippable-leadership — Federal leadership elections where party NPPs can vote
// Auth: requireAuthWithCharacter
// Errors: 400, 401, 403, 404
export async function GET(request: Request, { params }: RouteParams) {
  return handleWhippableLeadership(request, { params });
}
