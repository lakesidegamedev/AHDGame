import { GET as handleGET } from "@/lib/api/commands/stock-exchange/candles/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}
