import { POST as handlePOST } from "@/lib/api/commands/corporations/[id]/parent-bond-payoff/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
