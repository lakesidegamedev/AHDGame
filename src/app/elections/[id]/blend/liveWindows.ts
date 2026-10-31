/**
 * Turns from the close within which the screen may call itself "Election
 * Night". The general runs 48 turns; a race with more than this left is a
 * campaign being polled, not a count being read out.
 *
 * Lives apart from `generalBlendViewModel` because the detail page's "is this
 * live" check reads it, and importing the whole view model for one number put
 * the persuasion-driver rules on every election page.
 */
export const FINAL_STRETCH_TURNS = 4;
