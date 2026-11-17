import { POST as handlePOST } from "@/lib/api/commands/admin/country/[code]/elections/trigger-primaries/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
