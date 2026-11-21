import { GET as handleGET } from "@/lib/api/commands/game/turn/dashboard/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}
