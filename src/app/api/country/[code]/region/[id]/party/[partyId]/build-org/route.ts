import { POST as handlePOST } from "@/lib/api/commands/country/[code]/region/[id]/party/[partyId]/build-org/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
