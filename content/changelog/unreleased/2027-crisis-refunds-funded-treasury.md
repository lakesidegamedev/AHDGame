---
date: 2026-11-11
title: "Crisis responses and failed aid refund the treasury reliably"
summary: >-
  A crisis response that fails partway, or a crisis aid pledge whose bill
  fails, now returns its treasury money in every world, and trying the
  response again charges it again.
tags: [crises]
badges: [patch]
areas: [engine, backend]
---

In worlds that track treasury cash, a crisis response that failed after the
treasury paid could lose that money instead of refunding it, and the next try
of the same response that turn went through without being charged. Both are
fixed: the refund lands once, and each try is charged on its own.

When a crisis aid bill fails, the pledge is now clawed back exactly once. A
failure partway through can no longer reverse the aid's effects again on the
next turn.
