---
date: 2026-11-23
title: "Clearer bond issuing and credit page"
summary: >-
  The bond issue form now blocks amounts the game would refuse and explains
  the per-issue cap. The credit page no longer shows a loading state forever.
tags: [corporations, bonds]
badges: [patch]
areas: [frontend]
---

## What changed

- The per-issue cap on the bond form now says what the rule is: 25% of annual revenue, but never less than the flat minimum cap. A company with low revenue sees that floor, not a quarter of its revenue.
- The Issue bonds button stays off until the face value is within the allowed range, so a zero or too small issue is never sent. A refusal from the game now reads as plain text, without field names or error codes.
- The minimum issue size uses the same figure the game enforces, and every amount on the form is shown the same way: the bond currency first, then your display currency when it differs.
- Moving the face value slider clears an old error message.
- The Credit tab line formerly called "Annual operating income" is now "Annual sector income", with a note that it leaves out company-wide costs and so is higher than the operating income on the CEO Office.
- If a company's bond and credit figures cannot be fetched, the Leverage line on the Overview says so and offers a retry, instead of showing Loading forever.
- Small companies whose borrowing room is under the usual minimum issue size can now issue a bond down to the lower minimum the game offers them.
