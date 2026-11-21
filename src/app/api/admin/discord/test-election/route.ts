import { POST as handlePOST } from "@/lib/api/commands/admin/discord/test-election/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
