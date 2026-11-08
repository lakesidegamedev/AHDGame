import { runtimeConfig } from "@/lib/config/runtime";

/** Read at module-import time (server-side only). */
function getGameIteration(): string | undefined {
  return runtimeConfig.gameIteration() || undefined;
}

function getGameStartDate(): string | undefined {
  return runtimeConfig.gameStartDate() || undefined;
}

export function getGameStamp(): { gameIteration?: string; gameStartDate?: string } {
  const gameIteration = getGameIteration();
  const gameStartDate = getGameStartDate();
  return {
    ...(gameIteration ? { gameIteration } : {}),
    ...(gameStartDate ? { gameStartDate } : {}),
  };
}
