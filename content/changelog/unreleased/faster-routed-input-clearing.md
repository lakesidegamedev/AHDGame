---
date: 2026-11-07
title: "Turn processing spends less time sharing scarce inputs between buyers with route limits"
summary: >-
  Working out which suppliers each buyer can reach when scarce inputs are shared
  fairly is now done once per group instead of at every price level. Results are unchanged.
tags: [economy, performance]
badges: [patch]
areas: [engine]
---

## What changed

- When many companies compete for the same scarce input and some can only buy from certain suppliers, the turn now works out who can reach which supplier once, rather than repeating it at every price level.
- Who gets what is unchanged. This only shortens the time the corporation step takes on busy goods such as steel.
