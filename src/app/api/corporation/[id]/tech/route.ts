import { GET as handleGET } from "@/lib/api/commands/corporation/[id]/tech/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}
