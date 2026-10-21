---
date: 2026-10-21
title: Closing funds now pay out queued withdrawals
summary: A fund being wound up no longer gets stuck on withdrawals that were waiting in line.
tags: [funds, investing]
badges: [patch]
areas: [backend]
---

- When a sponsored fund is wound up, withdrawals still waiting in its queue are now paid once the fund's holdings have been sold, at a price based on the cash the fund actually has. The fund can then finish closing and pay its remaining holders.
