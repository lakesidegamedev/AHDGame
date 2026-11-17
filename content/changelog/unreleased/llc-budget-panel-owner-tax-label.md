---
date: 2026-11-17
title: "LLC budget panel names the owners' tax correctly"
summary: >-
  The CEO budget panel no longer calls a flow-through LLC's tax charge
  corporate tax.
tags: [corporations, display]
badges: [patch]
areas: [frontend]
---

On the CEO budget panel, the tax line for a flow-through LLC now reads "Owner
tax on pass-through profit" instead of "Corporate tax". That charge is the
owners' tax on the company's profit, collected at source, and the company pays
no corporate income tax on top. The Financials tab already described it this
way, so the two pages now match. The amount itself has not changed.
