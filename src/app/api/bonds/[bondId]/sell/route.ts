import { POST as handlePOST } from "@/lib/api/commands/bonds/[bondId]/sell/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
