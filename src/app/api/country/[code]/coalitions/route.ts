import {
  POST as handlePOST,
  GET as handleGET,
} from "@/lib/api/commands/country/[code]/coalitions/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}
