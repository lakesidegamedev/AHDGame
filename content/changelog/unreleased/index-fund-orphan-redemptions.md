---
date: 2026-10-24
title: Fund withdrawals whose owner has left the game
summary: A fund withdrawal whose owner no longer exists is closed instead of being retried forever, so the fund keeps trading.
badges: [patch]
areas: [backend]
tags: [index-funds, redemptions]
---

A queued fund withdrawal whose owner has left the game can never be paid, and it used to be retried every turn. Those rows are now closed, the cash stays in the fund, and the fund no longer pauses its regular rebalancing because of a withdrawal nobody can receive.
