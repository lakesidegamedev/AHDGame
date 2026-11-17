import { POST as handlePOST } from "@/lib/api/commands/political-operations/state-org/build/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
