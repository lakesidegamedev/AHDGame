import { POST as handlePOST } from "@/lib/api/commands/investment-funds/[slug]/subscribe/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
