import { GET as handleGET } from "@/lib/api/commands/country/[code]/parties/[id]/caucuses/[slug]/whippable-bills/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}
