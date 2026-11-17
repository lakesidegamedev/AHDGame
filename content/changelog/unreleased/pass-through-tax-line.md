---
date: 2026-11-17
title: "A company's tax line says whose tax it is"
summary: >-
  On a pass-through company's budget panel the tax line now names the owners'
  tax instead of corporate tax, because that company pays no corporate income
  tax of its own.
tags: [corporations, tax]
badges: [minor]
areas: [frontend]
---

## What changed

- A pass-through company (a US LLC, an S-Corp, a UK LLP) shows its tax line as owner tax on pass-through profit, which is what it is, rather than corporate tax.
- Where the owners' tax is still phasing in, the line says how far, so a rate below the full personal rate is explained.
- Companies that pay their own income tax still show corporate tax.
