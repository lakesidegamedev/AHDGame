/** Turn processing tuning and simulation diagnostics. */

export const workerConfig = {
  simRngSalt: () => process.env.SIM_RNG_SALT,
  simCorpTiming: () => process.env.SIM_CORP_TIMING === "1",
  simSeatHistoryCap: () => process.env.SIM_SEAT_HISTORY_CAP,
  electionResolutionConcurrency: () => process.env.ELECTION_RESOLUTION_CONCURRENCY,
  turnPhaseTimeoutMs: () => process.env.TURN_PHASE_TIMEOUT_MS,
  batchFundDividends: () => process.env.AHD_BATCH_FUND_DIVIDENDS,

  roundTripProfile: () => process.env.AHD_TURN_ROUNDTRIP_PROFILE === "1",
  roundTripMonitor: () => process.env.AHD_TURN_ROUNDTRIP_MONITOR === "1",
  roundTripTop: () => process.env.AHD_TURN_ROUNDTRIP_TOP,
} as const;
