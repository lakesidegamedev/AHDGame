import { POST as handlePOST } from "@/lib/api/commands/admin/country/[code]/region/[id]/assign-seat/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
