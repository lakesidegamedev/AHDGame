import { PUT as handlePUT, POST as handlePOST } from "@/lib/api/commands/suggestions/handlers";

export function PUT(...args: Parameters<typeof handlePUT>) {
  return handlePUT(...args);
}

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
