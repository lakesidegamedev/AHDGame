import { POST as handlePOST } from "@/lib/api/commands/country/[code]/international-organizations/[orgId]/legislation/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
