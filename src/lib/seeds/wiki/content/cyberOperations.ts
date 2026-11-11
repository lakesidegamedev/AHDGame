export const cyberOperationsContent = `# Cyber Operations

A country can attack another country's networks. The attack may knock out part of the power grid and dent the target's economy, but the attacker risks being named. This page covers who can launch one, what it costs, the odds, what happens afterwards, and how to stand down. Cyber operations sit beside the rest of the intelligence service (see [Cabinet](/wiki/cabinet)) and feed the world's [Cold War tension](/wiki/cold-war-tension).

## Who can launch

Only the **Director of Intelligence** of a country can order an operation, from the Intelligence tab of that office. An admin can too. If nobody holds the seat, a player cannot. You can target any other registered country that has network data. A country with no data to attack, and your own country, are refused.

Computer-run governments launch operations too (see "How computer-run countries use it" below). A computer-run government never launches for a service that has a player directing it.

## What it costs

Each operation is paid from your intelligence appropriation, the same pool the agency's other actions draw on. The price is a fixed share of your country's GDP, 0.0027% per operation, so a large economy pays more in cash but the same in proportion. If the appropriation cannot cover it, the operation is refused and nothing is charged. A stand-down is free.

Three limits apply on top of the cost:

- **Cooldown.** Your country must wait 24 turns (half a game year) between operations against the same target.
- **Truce.** If a stand-down truce between the two countries is in force, no operation can be launched in either direction.
- **One attack at a time.** A country can have only one Cyber Attack crisis running. While the target is already dealing with one, from anyone, a new operation against it is refused before launch and nothing is charged. This applies to players and computer-run governments alike. Once the crisis ends, the target can be attacked again, subject to the normal cooldown.

## The odds

The console shows the odds before you launch. They come from your **capability** against the target's **resilience**.

**Your capability** is mostly your own cyber score, sharpened by your agency's tradecraft (1 to 10). It is 70% your cyber score and 30% tradecraft, scaled to 0 to 1.

**Resilience** is how well a country's essential services hold up, from 0 to 1. Every country gets it from the same three things:

- **A base of 0.15.**
- **Technology.** Research and development spending as a share of GDP. Reaching 4% of GDP gives the full technology bonus of 0.35. A country with no figure is treated as 40% ready.
- **Utilities.** The state of the power and utility network, up to 0.25.
- **The cyber resilience mandate.** A law that sets cyber duties for operators. The strictest setting adds 0.3. The neutral setting adds nothing, and the laxest settings take away up to 0.08. The law also puts the cyber agency's cost into the security budget line, so the law is also your cyber spending line.

**Chance of getting through** is 45%, plus 0.9 points for every point your capability beats their resilience, and never below 5% or above 90%. No operation is ever certain, and none is hopeless.

**Chance of being named** is a separate roll. It starts at 20%, rises with the target's resilience (better logging) and falls with your capability (less left behind). A failed operation is louder and adds 20 points. The console shows both numbers, one for success and one for failure.

Worked example: your cyber score is 0.6 and tradecraft is 3, so capability is about 0.49. The target has resilience 0.5. You get through about 44% of the time. If you do, you are named about 30% of the time. If you are repelled, you are named about 50% of the time.

Success and being named are independent. You can get a clean success, a loud success, a quiet failure or a loud failure.

## When it gets through

A successful operation starts a short **Cyber Attack** crisis on the target (see [Crises](/wiki/crisis-interaction)). It brings grid outages, a dip in GDP, lower government approval and thinner company margins. The bigger your capability margin over their resilience, the harder it hits.

The target's own side can respond to the crisis with its normal [crisis responses](/wiki/crisis-responses).

## When you are named

If the target can name you, whatever the outcome:

- World tension goes up by 5 points.
- Your own government takes a short approval hit for 4 turns, as an exposure crisis in your country.
- A news post names you as the sponsor and says whether the intrusion got through.

If the target cannot name you, there is none of that. The attack is simply a crisis with no sponsor.

## Standing down

A country that has run an operation against a target can publicly stand down against it, unless a truce is already in force. A country that has never attacked a target has nothing to stand down from. Standing down:

- opens a **truce of 72 turns** (one and a half game years) that refuses any further operation by the country that stood down. The other country is also held back, but only until the stand-down country's own 24 turn cooldown would have ended, so a stand-down cannot shield an attacker from retaliation;
- lowers world tension by 4 points;
- posts a news item announcing the truce.

When the truce lapses, operations are possible again, subject to the normal cooldown.

## How computer-run countries use it

- **Background countries** and **computer-run governments** only target the leader of the rival bloc. A non-aligned country has no target.
- They only consider an operation when the government is hawkish (0.6 or higher on a 0 to 1 scale) and world tension is 25 or higher. Below that tension, or with a dovish government, nothing starts.
- They skip a rival that is already dealing with a cyber attack crisis.
- Even then they only try when the odds favour them (40% or better), and then only on some turns. The chance each turn rises with hawkishness and with tension.
- A government that has turned dovish, or a world that has cooled below 25 tension, stands down from a country it has been attacking. That opens the same truce a player gets.
- A computer-run government that governs a full country is limited to **2 launches per 72 turns**, with at least **12 turns** between launches, and pays from its intelligence appropriation, so an empty appropriation also stops it. Its hawkishness comes from the head of government's defence stance and ambition. Standing down is never capped.
- Background countries do not model a cyber budget, so a background attacker brings a fixed middling capability and is not charged.

## Defending yourself

You cannot block an attack in the moment. What you can do is raise your resilience ahead of time:

- Pass a strict cyber resilience mandate.
- Keep research and development spending up.
- Keep the utility network in good repair.

Standing down yourself only helps if you have been attacking: the other side is held back for as long as your own cooldown would last, not for the full 72 turns.

Last checked 2026-11-11, version 1.20.0.
`;
