export const tradeSystemContent = `# International Trade

A tariff on machinery or an embargo on grain does not delete trade by decree; it nudges one number, and the market follows. Every turn, countries with a surplus of a commodity sell to countries with a shortage. **Trade affinity** decides who sells to whom: the higher the affinity between two countries, the bigger the share of each other's surplus they take. Free trade agreements, shared organizations, tariffs and embargoes all work by moving that number up or down. Trade eases shortages and gluts at home (see [Commodities](/wiki/commodities)) and pays export-heavy [corporations](/wiki/corporations) a margin bonus.

## How affinity decides who trades with whom

For one commodity, the game lists the countries that make more than they use (exporters) and those that make less (importers). It then matches them, limited by how much surplus exists and how large each importer's shortage is. A tariff makes each imported unit use up more of that shortage, so it trims the volume as well as the affinity. Where two sides could match several partners, affinity tilts the split toward the higher-affinity pairs. A pair with affinity 0 does not trade that commodity at all.

Affinity is worked out per commodity and per direction, in this order:

1. **Base.** 1.0 for most pairs, higher for a few pairs with close trading ties (table below).
2. **Free trade agreement.** Multiply by 1.6 if an active FTA covers the pair.
3. **Shared organization.** Multiply by 1.25 if both countries belong to the same [international organization](/wiki/international-organizations), where FTAs and sanctions are also passed.
4. **Tariff drag.** Multiply by the drag from the importer's tariff on that flow (see [Tariffs](/wiki/tariffs)).
5. **Blocks.** An embargo (flows are blocked or capped in the trade clearing; see [Embargoes & Trade Exposure](/wiki/embargo-and-trade-exposure)), the iron curtain, or a full [blockade](/wiki/blockades) sets it to 0. A partial blockade scales it down.

\`\`\`
drag = 1 / (1 + 3 x tariff rate)
\`\`\`

### The numbers to plan around

| Rule | Value |
| --- | --- |
| Default base affinity | 1.0 |
| FTA bonus | x1.6 |
| Shared organization bonus | x1.25 (stacks with the FTA: x2.0) |
| Tariff drag formula | 1 / (1 + 3 x rate) |
| Embargo cost | 1 cabinet action |
| Longest ministerial embargo | 96 turns (2 game years) |
| Active ministerial embargoes per minister | 2 |
| Cooldown on the same target | 168 turns (3.5 game years), counted from enactment |
| Export margin bonus | up to 6 points |

### Pairs with a higher base

| Pair | Base |
| --- | --- |
| Ireland and UK | 1.6 |
| China and US | 1.5 |
| Germany and Ireland | 1.5 |
| Brazil and US | 1.4 |
| UK and US | 1.4 |
| Germany and UK | 1.4 |
| China and Japan | 1.4 |
| US and Yugoslavia (Cold War worlds) | 1.35 |
| Japan and US | 1.3 |
| China and Nigeria | 1.3 |
| Nigeria and UK | 1.3 |
| UK and Yugoslavia (Cold War worlds) | 1.25 |

### How much a tariff costs

The tariff that counts is the importer's total on that flow: its economy-wide tariff, plus any sector tariff for that commodity, plus any tariff aimed at the exporter's country, added together and capped at 100%. Tariffs aimed at one corporation do not count here. An active FTA between the two countries sets the tariff to zero.

| Tariff | Drag | Affinity change |
| --- | --- | --- |
| 0% | 1.000 | none |
| 5% | 0.870 | -13.0% |
| 10% | 0.769 | -23.1% |
| 20% | 0.625 | -37.5% |
| 50% | 0.400 | -60.0% |
| 100% | 0.250 | -75.0% |

See [Tariffs](/wiki/tariffs) for how tariff layers are enacted and what they do to corporations.

### Embargoes

An embargo is a deliberate break in trade. It can cover one commodity or all of them, exports, imports or both, and it can block the flow entirely or cap it at a fixed amount. Four things create one:

- **A trade minister** spends 1 cabinet action (see [Cabinet](/wiki/cabinet)). The limits are in the table above. Only the seated (or acting) trade minister of that country can do it.
- **Legislation** for a restriction that has to last longer than 96 turns without renewal.
- **An organization's sanctions resolution**, which lasts 48 turns.
- **A global crisis outcome** that carries trade sanctions (see [Global Response Crises](/wiki/global-response-crises)). Countries whose leaders backed the response embargo the targeted side when the crisis resolves, for a set number of turns.

The 168 turn cooldown starts when the embargo is enacted, not when it ends, and lifting early does not reset it. A full-length embargo therefore leaves 72 turns before the same minister's country can embargo that target again. Governments run by computer-controlled parties can also impose and lift temporary embargoes, under the same limits. What an embargo does to a company is covered in [Embargoes and Trade Exposure](/wiki/embargo-and-trade-exposure).

### The iron curtain

In Cold War worlds with command economies, planned-economy countries trade only with each other. Trade between a curtained country and the open world is zero in both directions, and no FTA, shared organization or tariff setting reaches across it. A country leaves the curtain as its economy marketizes (see [Planned Economies](/wiki/planned-economies), where command-economy countries sit behind it). Yugoslavia is outside the curtain from the start: it broke with Moscow before the 1953 world opens and trades with the West, while keeping a planned economy at home and losing access to the Comecon market.

### What clearing trade does for you

- **Prices.** Goods that cross a border count against the exporter's surplus and the importer's shortage before prices are set, so trade softens price swings in both countries.
- **Export margin bonus.** A sector earns bonus margin for output that actually sells abroad. The bonus is each commodity's output rate times the share of the country's surplus that cleared abroad, times 6, capped at 6 points. A sector making a commodity at rate 0.5 where 80% of the surplus exports earns 0.5 x 0.8 x 6 = 2.4 points.
- **Embargo exposure.** The same export share is how much of a sector's revenue an embargo takes away.

### Germany sells machinery to Ireland

Their base is 1.5, both are in the same organization, and Ireland has a 20% economy-wide tariff.

- No FTA: 1.5 x 1.25 x 0.625 = 1.17.
- With an FTA: the tariff drops to 0, so 1.5 x 1.6 x 1.25 = 3.00.

The FTA more than doubles their affinity (about 2.6 times). If Ireland's trade minister then embargoes imports from Germany (or both directions) on all commodities, the pair goes to 0 until the embargo ends.

## Using trade as a player

- **See trade flows and restrictions.** The World screen has a Trade page with a Restrictions view listing active embargoes.
- **Impose an embargo** as a trade minister, from the minister's office page. Choose the target, commodity, direction, block or cap, and duration.
- **Set tariffs** through [tariff legislation](/wiki/tariffs). A blockade on either country's coast ([Blockades](/wiki/blockades)) also closes or scales down the flow.
- **Pass an FTA** inside an Economic or Development [international organization](/wiki/international-organizations). Only the countries named in the agreement vote, and all of them must say yes.

Tips:

- An FTA is the biggest single lever, because it multiplies affinity by 1.6 and removes tariff drag together.
- Shared membership gives a 25% lift with no legislation.
- Use embargoes for short, targeted pressure. They expire and then lock you out of re-imposing for 72 turns at least.
- A corporation that sells almost entirely into one country is the one an embargo against that country hurts most.

Applies in every world; the iron curtain, Yugoslavia's exemption and the Cold War pairs apply only in worlds that begin in the Cold War eras. Last checked 2026-10-29, version 1.18.0. Exact rules: there is no separate design page for the affinity calculation yet; the tariff layers it reads are on the [Tariffs (design)](https://docs.lakesidegames.net/design/tariffs.html) page.
`;
