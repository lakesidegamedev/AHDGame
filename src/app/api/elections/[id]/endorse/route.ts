import {
  POST as handlePOST,
  DELETE as handleDELETE,
} from "@/lib/api/commands/elections/[id]/endorse/handlers";

export function POST(...args: Parameters<typeof handlePOST>) {
  return handlePOST(...args);
}

export function DELETE(...args: Parameters<typeof handleDELETE>) {
  return handleDELETE(...args);
}
