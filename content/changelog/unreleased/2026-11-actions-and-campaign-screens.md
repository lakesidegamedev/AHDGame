---
date: 2026-11-23
title: "Action previews, canvass wording and Campaign Manager race detection fixed"
summary: >-
  Run-again hints now state the full cost, Campaign and Run Advertisements show the gain you will really get,
  and Campaign Manager recognises your own race.
tags: [actions, campaigns, elections]
badges: [patch]
areas: [fullstack]
---

## What changed

- When a 5 times or 10 times button is greyed out, the hint now states what all the runs cost together and what you have. It used to quote a single later run against whatever was left after the earlier runs.
- Campaign and Run Advertisements show the gain you will actually get, after your Charisma. The card headline and the After line now agree. The card text no longer says the gain tapers below 70% favorability.
- Canvassing shows one clear result: the turnout change in the target group. The group boost and the original-rule figure are labelled as extra detail, and the original-rule line only appears when it differs.
- Race names read as words, such as "State Senate race in Ohio", in the entry confirmation, the poll result, the canvass screen and the campaign page link.
- Campaign Manager now recognises your own race when you play more than one character, so it no longer says you are not running and the Target panel no longer fails to load your influence.
- Campaign Manager and its map show a loading spinner instead of a blank area while they load.
