import { POST as handlePOST } from "@/lib/api/commands/admin/elections/recalibrate-timers/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
