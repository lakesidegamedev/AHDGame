import { quoteSaleTax } from "@/lib/corporations/commands/shareTrading/quoteSaleTax";

// POST /api/corporations/[id]/shares/tax-quote
// Auth: requireBasicAuth. Owner-only read-only preview. Errors: 400, 401, 404, 429.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return quoteSaleTax(request, context);
}
