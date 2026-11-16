import { POST as handlePOST } from "@/lib/api/commands/country/[code]/parties/[id]/recruitment/recruit/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
