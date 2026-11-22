import { buildRoomVerdict } from "@/lib/corporations/rules/buildRoomVerdict";

/** Outcome recorded when an automatic build is refused for lack of room. */
export type AutoBuildRoomGate = "no_build_room";

/**
 * The room-to-build gate every automatic construction decision shares (autopilot
 * and computer-run companies), reading the same verdict as the build dialog.
 * Buyers must have unmet demand for the output; a room that was not measured is
 * no room. A build sized on a measured shortage is demand-led and passes.
 * Returns null when the build may proceed or the stage is off.
 */
export function evaluateAutoBuildRoomGate(args: {
  stage: number | null | undefined;
  roomUnits: number | null | undefined;
  demandLed: boolean;
}): AutoBuildRoomGate | null {
  if (!((args.stage ?? 0) >= 1)) return null;
  if (args.demandLed) return null;
  return buildRoomVerdict(args.roomUnits) === "room" ? null : "no_build_room";
}
