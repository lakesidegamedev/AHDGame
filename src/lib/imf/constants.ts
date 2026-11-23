/** Max share of per-turn income (₳) that can go to IMF facility payment — rest extends schedule. */
export const IMF_BAILOUT_INCOME_FRACTION_CAP = 0.45;

/** Default capture when activating a bailout or when legacy documents omit the field. */
export const IMF_BAILOUT_DEFAULT_INCOME_CAPTURE_FRACTION = 0.35;

/** Stored share price multiplier while IMF bailout is active (discipline / stigma). */
export const IMF_BAILOUT_SHARE_PRICE_MULTIPLIER = 0.85;

/**
 * What players are told about the IMF corporation. It only holds restructuring
 * facilities for corporate bonds that an administrator opens; countries cannot
 * apply for IMF programmes.
 */
export const IMF_INSTITUTION_PLAYER_DESCRIPTION =
  "A holding entity for IMF restructuring facilities on corporate bonds, opened only by game administrators. It has no capital of its own. Countries cannot apply for IMF programmes in this game.";
