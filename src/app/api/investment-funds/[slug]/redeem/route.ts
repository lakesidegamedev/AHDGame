import { handleRedeemFundShares } from "@/lib/indexFunds/redeemFundShares";

// POST /api/investment-funds/[slug]/redeem - Redeem (sell) fund units
// Auth: logged-in user with a character
// Requires "full" mode - partial mode blocks player transactions.
// Pays from fund cash, sells underlying shares to public float when needed,
// then queues any remainder for the hourly fund cycle.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handleRedeemFundShares(request, { params });
}
