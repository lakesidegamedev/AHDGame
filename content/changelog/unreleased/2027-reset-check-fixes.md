---
date: 2026-11-07
title: "2027 world setup fixes"
summary: >-
  A fresh 2027 world now seats Reform UK's members of parliament under their
  own party, and the setup check no longer reports background countries as
  broken. Other start dates and the live world are unchanged.
tags: [world, setup, united-kingdom]
badges: [patch]
areas: [engine, backend]
---

## What changed

- In a 2027 world, Reform UK's five Commons seats now belong to Reform UK. They were previously seated as independents.
- The setup check that runs after a new world is created no longer flags background countries for having no local businesses. Background countries run outside the full simulation by design, so a fresh 2027 world now passes the check and records its starting snapshot.
- Worlds started from any other date, and the live world, behave exactly as before.
