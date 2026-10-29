/**
 * Flags rate-limit calls keyed by a bare user id.
 *
 * The in-memory limiter keeps one counter per key, and every route compares
 * that counter against its own cap. A bare `auth.user.userId` key therefore
 * shares one counter with every other route that uses a bare user id, so a
 * player who makes 25 clicks in one feature is rejected on their first click
 * in another feature with a cap of 10.
 *
 *   // BUG: shared with every other bare-userId route
 *   checkRateLimit(auth.user.userId, 20, 60_000);
 *
 *   // OK: this route's own counter
 *   checkRateLimit(`api/campaigns/[id]/rally:${auth.user.userId}`, 20, 60_000);
 *
 * Sharing a counter on purpose is still allowed: give the shared key an
 * explicit prefix (for example `party-influence:${userId}`).
 */
"use strict";

const LIMITERS = new Set(["checkRateLimit", "durableRateLimit"]);

/** @param {any} node */
function isBareUserId(node) {
  if (!node) return false;
  if (node.type === "Identifier") return /userId$/i.test(node.name);
  if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier") {
    return /userId$/i.test(node.property.name);
  }
  if (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === "String"
  ) {
    return isBareUserId(node.arguments[0]);
  }
  return false;
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Rate-limit keys must be scoped to a route or feature, not a bare user id",
    },
    schema: [],
    messages: {
      unscoped:
        "Rate-limit key is a bare user id, which shares one counter across every route. Prefix it with the route or feature, e.g. `api/<route>:${userId}`.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || !LIMITERS.has(node.callee.name)) return;
        if (isBareUserId(node.arguments[0]))
          context.report({ node: node.arguments[0], messageId: "unscoped" });
      },
    };
  },
};
