---
date: 2026-10-22
title: Manual turns no longer slow the site
summary: Turns started by staff now run in the background turn processor instead of the website.
tags: [turns, reliability]
badges: [patch]
areas: [backend]
---

- A turn started by staff is now handed to the background turn processor, so the site stays responsive while it runs. Previously a manually started turn could make pages time out for everyone until it finished.
