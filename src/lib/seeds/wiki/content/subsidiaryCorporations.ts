export const subsidiaryCorporationsContent = `# Subsidiary Corporations

You hold the votes in a company that someone else runs. Formalize it as your **subsidiary** and you can fund it directly, force a minimum dividend, appoint its CEO, and spin pieces of your own business into new subsidiaries. In return the subsidiary cannot issue shares, and your group's tax and strength figures are read together.

Being a subsidiary is derived live, not stored as a permanent flag. A corporation is your subsidiary only while you control more than 50% of its voting power and the relationship has been formally declared. If either stops being true, so does the relationship. Share ownership and voting power from [Corporations](/wiki/corporations) decide who controls whom, and buying or selling shares on the [Stock Market](/wiki/stock-market) can lift you above 50% or drop you below it.

## Three ways to get one

1. **Formalize one you already control.** You hold more than 50% of the voting power and declare it.
2. **Buy one as a subsidiary.** Make an acquisition offer on the Deals tab and choose **Keep as subsidiary** (see [Corporate Mergers & Acquisitions](/wiki/corporate-mergers)). The shareholders are paid and you become the only shareholder, while the target keeps its sectors, cash, bonds, bank charter and management. It keeps its own bonds, which is what lets you buy a bonded company this way (see [Corporate Bonds](/wiki/corporate-bonds)).
3. **Spin off a piece of your own business** into a new corporation that you own 100%.

Which route? Formalize when you already hold the votes and want the powers and tax relief. Buy as a subsidiary when you want a whole company to keep running as it is. Spin off when you want to separate part of your own business without losing it.

**To formalize you need:**

- **More than 50% voting power**, counting dual-class supershares and not only raw share count. Shares you have listed in an open sell order still count, so listing a block does not drop your powers before the trade fills.
- A target that is not already a subsidiary and is not state-owned.
- A parent that is not state-owned and not itself a subsidiary. **No chains:** a subsidiary can never be a parent.
- **No ownership cycles.** You cannot formalize a corporation that, through another holding, already controls you.
- **A different human running it.** The subsidiary's sitting CEO cannot be you, the parent's CEO, or the sitting CEO of any of your other subsidiaries. A computer-run caretaker counts as a different operator.

**It ends automatically.** If your voting control falls to 50% or below (you sell down or are diluted), the game clears the formalization on the next turn and the dividend floor goes with it. You can also release a subsidiary yourself, but only once it has been formalized for 24 turns, so the relationship cannot be flipped on and off in one session. A formalized group also counts as one controlled group when merger review measures market share and sell-down orders.

![Checklist to formalize a subsidiary, the powers and limits it brings, and the automatic clearing when voting control falls to 50% or below.](/wiki-images/diagrams/subsidiary-corporations-formalization.svg)

| Item | Value |
| --- | --- |
| Voting power needed | more than 50% |
| Minimum time formalized before you may release | 24 turns |
| Capital injection cap | 25% of the parent's liquid capital per injection |
| Wait between injections to the same subsidiary | 24 turns |
| Dividend floor range | 0% to 25% |
| Spin-off cost | ₳500,000 plus ₳100,000 per sector moved |
| Wait between spin-offs by the same parent | 168 turns |
| Strength lift: share of the gap closed each turn | 5% |
| Strength ceiling for a member | 60% of the group leader's |
| Strength ceiling for a recent spin-off | 85% of the leader's, for 96 turns |
| Cross-border pricing audit starts above | ₳5,000,000 shifted |
| Audit surcharge | 40% on the reassessed tax |
| Group supply discount | 0% to 35% |

A game year is 48 turns, so 24 turns is half a year and 168 turns is three and a half years.

## What a parent can do

All parent actions need you to be the parent's CEO.

- **Inject capital.** Send cash straight into the subsidiary's treasury, converted by exchange rate if needed. One injection is capped at 25% of your liquid capital, with a 24-turn wait per subsidiary. Use it to prop up a struggling subsidiary or fund growth without the stock market. With ₳8,000,000 of liquid capital, you can inject up to ₳2,000,000 now, and again after 24 turns.
- **Set a dividend floor.** Choose a minimum dividend rate from 0% to 25% that the subsidiary must pay, which its own CEO cannot undercut (they can pay more). The dividends go to its shareholders, including you. Lose control and the floor stops at once.
- **Appoint the CEO.** Reseat the CEO with a computer-run caretaker (the previous human stays attached and can reclaim later) or with a different human. If the seat is vacant you can appoint an eligible computer-run official. A reclaim is refused if that human already runs another of your subsidiaries.
- **Spin off a piece of your business.** Carve one sector type out of your own corporation into a new corporation that starts private and 100% owned by you. All sectors of that type move with their plant capacity intact. It is a formalized subsidiary from the moment it exists.
- **Release.** After 24 turns you can let a subsidiary go.

**No share issuance.** A formalized subsidiary cannot go public, issue new shares or sell new stock for any reason. New shares would dilute your stake and could drop you below 50%. Fund it with a capital injection instead, or release it first if it genuinely needs to raise equity.

## Tax relief within a group

Corporations linked by formalized subsidiary ties form a **group**. Each is taxed on its own every turn. Then, if the group has a profitable member and a loss-making member in the **same country**, the loss shelters the profit and part of the tax already paid is rebated.

![How group tax relief works: a same-country loss shelters a profit member and a capped rebate is paid back, while a loss in another country shelters nothing.](/wiki-images/diagrams/subsidiary-corporations-tax-relief.svg)

Member A earns ₳1,000,000 and pays ₳250,000 tax (25%). Member B, in the same country, loses ₳400,000. The loss shelters ₳400,000 of profit at 25%, so the group is rebated ₳100,000, paid back to A. A loss in another country shelters nothing.

The rebate never exceeds the tax actually paid, and it goes back to the members that paid, in proportion to what they paid. Cross-border pricing between group members is a separate audit: if more than ₳5,000,000 of profit appears to be shifted on one agreement, the tax authority can reassess it with a 40% surcharge. Same-country pricing is ignored, because it moves no tax between treasuries.

## Marketing and logistics strength

Weaker members are pulled **up** toward the group's strongest Marketing Strength and Logistics Strength, never down, so buying a weak company does not punish a strong parent. A normal member can reach at most 60% of the leader's strength. A recent spin-off from a current group member gets a higher ceiling of 85% for 96 turns, since it inherits the brand. Each turn the member closes 5% of the remaining gap.

If the leader has Marketing Strength 80 and a member has 20, the member's ceiling is 60% of 80 = 48, so the gap is 28 and it gains 1.40 in the first turn, then about 1.33 in the next. It approaches 48 gradually and never exceeds it.

\`\`\`wiki-chart
group-synergy-convergence
\`\`\`

In some worlds the strength lift is paid for by the group's strongest member rather than created from nothing.

## The Subsidiary Group page

Open the Subsidiary Group page from the link under My Corporation or from the group summary on a corporation page. It lets you compare members' daily revenue, cash and operating footprint, and the totals include trading between members. Each member still holds its own cash. The parent CEO can set a group name and logo and save objectives for subsidiaries. Player CEOs can accept or decline suggestions, and computer-run subsidiaries follow them from the next turn within their normal safeguards.

**Group supply.** Where your world supports it, the page also lets the group buy inputs from its own members before the open market. The parent can set a **group supply discount** of 0% to 35% (the default is 0%), which moves operating profit from the supplier to the buyer without changing the sale value at the market price. Player CEOs choose whether to receive group supplies, and this never commits their own output. Supplies stay within one country.

Your corporation page also shows a read-only **group balance sheet**: total liquid capital, total sector revenue, sector count, and how many industries and countries the group spans.

Available in worlds where the feature is open. If the Keep as subsidiary choice and the Subsidiary Group page do not appear for you, your world does not have it. Group supply and its discount are offered only where the Group page shows them. Last checked 2026-10-29, version 1.18.0. Exact rules: [Subsidiary Corporations (design)](https://docs.lakesidegames.net/design/subsidiary-corporations.html). See also: [Glossary](/wiki/glossary)
`;
