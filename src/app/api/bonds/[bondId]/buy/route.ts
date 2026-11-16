import { POST as handlePOST } from "@/lib/api/commands/bonds/[bondId]/buy/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
