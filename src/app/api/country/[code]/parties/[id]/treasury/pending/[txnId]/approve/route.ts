import { POST as handlePOST } from "@/lib/api/commands/country/[code]/parties/[id]/treasury/pending/[txnId]/approve/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
