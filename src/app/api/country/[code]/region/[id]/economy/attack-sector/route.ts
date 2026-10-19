// POST /api/country/[code]/region/[id]/economy/attack-sector
// Splitting rival plants has been removed. Refuse before any read, write or charge.
import { errorResponse } from "@/lib/api/errors";

export async function POST() {
  return errorResponse(410, "Splitting rival plants has been removed from the game.");
}
