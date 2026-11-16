import { GET as handleGET } from "@/lib/api/commands/corporations/[id]/bond-default/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}
