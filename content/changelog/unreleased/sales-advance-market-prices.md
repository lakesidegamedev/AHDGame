---
date: 2026-11-04
title: "Plants whose sales pay for them keep running after a big build, and builds keep a cash reserve"
summary: >-
  Behind a new stage switch, a company that spent its cash still runs plants
  whose sales cover their costs at market prices, instead of being held to the
  cash left over. Capacity builds paid from cash now stop before cash falls
  below three turns of the plants' running costs, unless the CEO confirms.
tags: [economy, producer-market, corporations]
badges: [patch]
areas: [engine]
---

## What changed

- When a company is short of cash, its plants can borrow against the sales the run will make in the same turn. That only happened when expected sales covered the run's costs, and the costs were counted with every input at the highest price the company would bid, often three to ten times what the input actually sold for. At those prices almost no run ever covered its costs, so a company that spent its cash on construction ran on its leftover cash alone and earned too little to rebuild it.
- In one case a company spent most of its cash on new capacity. Its plants then ran at about 12% of plan for turns on end: inputs counted at the bid ceiling came to 23.7 million a turn, against 6.2 million at last turn's market prices, and its sales fell from about 7 million a turn to about 1.2 million.
- With `producerSalesAdvancePriceStage` at 1, the check uses last turn's market price for each input, never above the bid ceiling. The amount borrowed is still capped by the run's expected sales, and anything the sales do not cover is still owed as an ordinary bill, so no money is created. Off by default; nothing changes until it is switched on.
- Replaying the latest turn with the switch on: 198 companies were held back by cash, and 119 of them would run their full plan. The company above would make about 207,000 units instead of 32,000 and sell about 7.7 million instead of 1.2 million, with nothing left owed. Total cash in the world is unchanged.
- Capacity builds, one at a time or in bulk, now stop if they would leave less cash than three turns of the plants' running costs (wages, site bills and inputs from their last turn). The refusal states the reserve and the largest build that keeps it. The CEO can confirm to build anyway. Builds paid by a construction loan are not affected. `capacityBuildReserveTurns` changes the number of turns; 0 turns it off.
