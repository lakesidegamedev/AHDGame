/** Read at module-import time (server-side only). */
function getGameIteration(): string | undefined {
  return process.env.GAME_ITERATION || undefined;
}

function getGameStartDate(): string | undefined {
  return process.env.GAME_START_DATE || undefined;
}

export function getGameStamp(): { gameIteration?: string; gameStartDate?: string } {
  const gameIteration = getGameIteration();
  const gameStartDate = getGameStartDate();
  return {
    ...(gameIteration ? { gameIteration } : {}),
    ...(gameStartDate ? { gameStartDate } : {}),
  };
}
