import {
  GET as handleGET,
  PATCH as handlePATCH,
  DELETE as handleDELETE,
} from "@/lib/api/commands/country/[code]/parties/[id]/caucuses/[slug]/handlers";

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}

export function PATCH(...args: Parameters<typeof handlePATCH>) {
  return handlePATCH(...args);
}

export function DELETE(...args: Parameters<typeof handleDELETE>) {
  return handleDELETE(...args);
}
