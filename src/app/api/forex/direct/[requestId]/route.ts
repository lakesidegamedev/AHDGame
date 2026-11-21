import { POST as handlePOST } from "@/lib/api/commands/forex/direct/[requestId]/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
