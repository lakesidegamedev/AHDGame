import { handleClientStatus } from "@/lib/client/clientStatus";

// GET /api/client-status — Returns status bar enrichment data (funds, corp, election stats, income).
// Auth: requireBasicAuth
// Errors: 401
export async function GET(request: Request) {
  return handleClientStatus(request);
}
