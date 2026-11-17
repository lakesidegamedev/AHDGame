import { GET as handleGET } from "@/lib/api/commands/country/[code]/region/[id]/party/[partyId]/election/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}
