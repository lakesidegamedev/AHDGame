import { POST as handlePOST } from "@/lib/api/commands/forex/orders/[orderId]/fill/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
