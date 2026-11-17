import { GET as handleGET } from "@/lib/api/commands/client-nav/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}
