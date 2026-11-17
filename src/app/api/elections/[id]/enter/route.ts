import { POST as handlePOST } from "@/lib/api/commands/elections/[id]/enter/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
