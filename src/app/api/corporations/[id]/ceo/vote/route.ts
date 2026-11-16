import {
  POST as handlePOST,
  GET as handleGET,
  DELETE as handleDELETE,
} from "@/lib/api/commands/corporations/[id]/ceo/vote/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}

export function GET(...args: Parameters<typeof handleGET>) {
  return handleGET(...args);
}

export function DELETE(...args: Parameters<typeof handleDELETE>) {
  return handleDELETE(...args);
}
