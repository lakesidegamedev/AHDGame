import { POST as handlePOST } from "@/lib/api/commands/corporations/[id]/bond-default/cash/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
