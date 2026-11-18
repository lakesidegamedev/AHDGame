import type { GameState } from "@/lib/db/types/gameState";

export function shouldPauseFoundingCrisisOpenings(
  founding: GameState["preIteration"],
  turn: number
): boolean {
  // A retry can reload the completed snapshot before the turn counter advances.
  return founding?.active === true || founding?.completedTurn === turn;
}
