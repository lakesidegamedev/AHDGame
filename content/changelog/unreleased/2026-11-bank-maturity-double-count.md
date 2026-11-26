---
date: 2026-11-26
title: Banks no longer count matured bills twice, and get time to fix a shortfall
summary: A bank's bills that had just been repaid were still valued as bills, so a bank could pay out more than it had. A bank whose assets dip below what it owes now gets a warning and three turns to post capital before it is closed.
tags: [banking]
badges: [patch]
areas: [backend]
---

## What changed

- When a government bill a bank holds is repaid, the bank's holdings stop counting it the same moment the cash lands in its vault. Before, the bill could be counted as cash and as a bill at once until the next turn, which overstated what the bank was worth, what its owner could withdraw, and its capital rating.
- A bank whose assets fall a little short of what it owes, but which still holds enough cash and bills to meet its reserve requirement, is no longer closed on the spot. Its owner gets a notice with the size of the gap and the turn it must be closed by, and payouts to the owner stay blocked until then.
- A bank that is still short at that deadline, is short by more than 5% of what it owes, or cannot meet its reserve requirement is closed as before. A bank already in a run is closed as before.
