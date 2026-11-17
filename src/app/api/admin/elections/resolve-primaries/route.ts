import { POST as handlePOST } from "@/lib/api/commands/admin/elections/resolve-primaries/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
