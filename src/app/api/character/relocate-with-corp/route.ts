import { handleRelocateWithCorp } from "@/lib/character/relocateWithCorp";

// POST /api/character/relocate-with-corp — Combined character and corporation relocation (CEO only).
// Auth: requireAuthWithCharacter
// Errors: 400, 401, 403, 429
export async function POST(request: Request) {
  return handleRelocateWithCorp(request);
}
