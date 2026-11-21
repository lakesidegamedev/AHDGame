import { POST as handlePOST } from "@/lib/api/commands/characters/[id]/wire/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
