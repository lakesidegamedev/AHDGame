---
date: 2026-11-23
title: "Parliamentary executive pages load faster"
summary: >-
  The government page for Canada and the other parliamentary countries now
  fetches its information in parallel instead of one piece at a time.
tags: [performance, government]
badges: [patch]
areas: [backend]
---

The executive page for parliamentary countries used to look up the government,
the chamber, the votes in progress and the opposition one after another. It
now asks for everything that does not depend on something else at the same
time, so the page appears sooner, especially when the server is busy. Nothing
on the page changes.
