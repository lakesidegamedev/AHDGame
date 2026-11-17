import { POST as handlePOST } from "@/lib/api/commands/admin/demographics/reseed/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
