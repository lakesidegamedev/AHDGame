import { GET as handleGET } from "@/lib/api/commands/discord-bot/government/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}
