---
date: 2026-10-23
title: Funds no longer stall on an unpaid withdrawal
summary: A fund can rebalance again after a withdrawn holding's owner has been removed.
tags: [investment-funds, economy]
badges: [patch]
areas: [backend]
---

- A queued withdrawal whose holder no longer exists is now closed instead of being retried forever. Its units already left the fund when it was requested, so nothing further is owed and the cash stays with the fund's other holders. This lets the fund rebalance again.
- Older withdrawals whose units are still held by the fund are left queued and logged, because closing those would remove a claim without paying it.
