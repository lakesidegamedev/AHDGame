---
date: 2026-11-09
title: "Crisis responses by office: levers, costs and emergency bills"
summary: >-
  Office holders can now answer a crisis built on the new model with a real
  response that costs real resources, and a legislature can pass a fast-track
  emergency bill. No live crisis uses the new model yet, so nothing changes in
  play today.
tags: [world, crises]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Each crisis role now resolves to real office holders: heads of state, governors, legislative leaders, central bank chairs, finance ministers, party chairs and corporate CEOs. Holders who had a response available and did nothing are recorded as such.
- A new action lets a holder pull a response on a crisis. It checks the office, the crisis stage and a cooldown, then charges the cost: treasury cash, corporation cash, and approval. A double click charges once, and a failed charge is refunded.
- A legislature response raises an emergency bill with a short voting window. If it passes, the cost is paid and the response counts. If it fails, the sponsor is recorded as having failed to act.
- A lookup lists the crises where the viewer has a response available right now, ready for the crises page and a nav badge.
- Political capital costs are paid in the holder's own actions for the turn (one to three, by the size of the response).
- The turn phase now claims each crisis's turn before applying its effects, so a failed save can no longer apply the same effects twice.
