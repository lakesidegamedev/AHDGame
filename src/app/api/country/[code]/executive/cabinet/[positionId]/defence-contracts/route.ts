import { errorResponse } from "@/lib/api/errors";
import { DELETE as handleDELETE } from "@/lib/api/commands/country/[code]/executive/cabinet/[positionId]/defence-contracts/handlers";

export async function POST() {
  return errorResponse(
    410,
    "Direct awards have been replaced by government contract bidding. Publish a country tender instead."
  );
}

export function DELETE(...args: Parameters<typeof handleDELETE>) {
  return handleDELETE(...args);
}
