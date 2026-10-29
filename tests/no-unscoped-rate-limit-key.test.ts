/**
 * A bare user-id rate-limit key fails silently: nothing errors, players just
 * get "sending requests too quickly" on routes they have barely touched. The
 * rule is the only guard, so it carries its own cases.
 */
import { RuleTester } from "eslint";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rule = require("../eslint-rules/no-unscoped-rate-limit-key.js");

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-unscoped-rate-limit-key", rule, {
  valid: [
    { code: "checkRateLimit(`api/actions/execute:${user.userId}`, 60, 60000);" },
    { code: "checkRateLimit(`party-influence:${auth.user.userId}`, 120, 60000);" },
    { code: 'checkRateLimit("government-contracts:" + auth.user.userId, 20, 60000);' },
    // IP keys are shared across auth routes on purpose.
    { code: "checkRateLimit(clientIp, 10, 60000);" },
    { code: "durableRateLimit(clientIp, 10, 60000);" },
    { code: "otherLimiter(auth.user.userId, 10, 60000);" },
  ],
  invalid: [
    { code: "checkRateLimit(auth.user.userId, 20, 60000);", errors: [{ messageId: "unscoped" }] },
    { code: "checkRateLimit(userId, 20, 60000);", errors: [{ messageId: "unscoped" }] },
    {
      code: "checkRateLimit(apiAuth.ownerUserId, 20, 60000);",
      errors: [{ messageId: "unscoped" }],
    },
    { code: "checkRateLimit(String(ctx.userId), 20, 60000);", errors: [{ messageId: "unscoped" }] },
    { code: "durableRateLimit(auth.user.userId, 10, 60000);", errors: [{ messageId: "unscoped" }] },
  ],
});
