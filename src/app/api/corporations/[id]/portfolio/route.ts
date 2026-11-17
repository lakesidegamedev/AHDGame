import { GET as handleGET } from "@/lib/api/commands/corporations/[id]/portfolio/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}
