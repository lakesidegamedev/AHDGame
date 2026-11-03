---
date: 2026-11-03
title: Deleted fund holders no longer block rebalancing
summary: Queued withdrawals whose units were already burned are cancelled when their holder no longer exists.
tags: [index-funds, settlement]
badges: [patch]
areas: [engine]
---

A deleted holder no longer leaves an already-burned withdrawal blocking its fund forever. The claim is cancelled with a warning; fund cash and unit supply stay unchanged. Legacy claims with unburned units remain queued for reconciliation. An unfinished settlement keeps ownership of its claim.
