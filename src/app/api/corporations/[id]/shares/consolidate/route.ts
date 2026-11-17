import { POST as handlePOST } from "@/lib/api/commands/corporations/[id]/shares/consolidate/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
