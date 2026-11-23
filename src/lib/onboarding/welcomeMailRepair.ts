/**
 * Rewrites the opening sentence of Game Guide welcome mails sent before they
 * said the figures are opening amounts. Pure; text already repaired is
 * returned unchanged.
 */
const OLD_OPENING =
  /^You have a character, a home ([a-z ]+), (\S+) in campaign funds, and (\d+) bonus actions\. That is more than most politicians start with\./;

export function repairWelcomeMailBody(body: string): string {
  return body.replace(
    OLD_OPENING,
    (_m, region: string, funds: string, actions: string) =>
      `You started with a character, a home ${region}, ${funds} in campaign funds, and ${actions} bonus actions. Those are your opening figures from the day you created this character, not your current balance. That is more than most politicians start with.`
  );
}
