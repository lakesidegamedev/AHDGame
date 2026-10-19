---
date: 2026-10-19
title: Closing funds pay waiting withdrawals and finish closing
summary: Funds that are being wound up no longer get stuck when withdrawal requests were still waiting to be paid.
tags: [investment-funds, withdrawals]
badges: [patch]
areas: [engine]
---

- A fund being wound up now pays any withdrawal requests still waiting in its queue once its holdings have been sold, then finishes closing.
- Waiting withdrawals are paid at the same value per unit as the holders paid at closing, based on the cash the fund actually holds.
