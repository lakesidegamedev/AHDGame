import { POST as handlePOST } from "@/lib/api/commands/corporations/[id]/shares/self-issue/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
