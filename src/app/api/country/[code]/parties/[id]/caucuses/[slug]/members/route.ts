import {
  GET as handleGET,
  POST as handlePOST,
} from "@/lib/api/commands/country/[code]/parties/[id]/caucuses/[slug]/members/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}
