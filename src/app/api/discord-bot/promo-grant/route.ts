import { POST as handlePOST } from "@/lib/api/commands/discord-bot/promo-grant/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
