export const automationLevyContent = `# Automation Levy

Some production methods replace workers with machines. A country can tax that. The **automation tax** and the **pension levy** are two laws that charge companies running those methods, and the money goes to the national treasury. This page covers who pays, how much, and where the money ends up.

## Who pays

The levies fall on a sector running an automation method. The four methods are:

- Humanoid robotics
- Agentic services
- Autonomous factory
- Autonomous freight

A sector on any other method pays nothing. The methods come from the late research tiers (see [Corporate R&D & Tech Trees](/wiki/corporate-r-and-d)).

## What it costs a company

The levy is a share of what the company pays for inputs each turn. It is not a tax on profit, so a company that spends a lot on inputs pays more, whether or not the plant is making money. Each law has five settings, from off to the strictest:

| Setting | Automation tax | Pension levy |
| --- | --- | --- |
| Off | 0% | 0% |
| Level 1 | 1% | 0.5% |
| Level 2 | 2.5% | 1.2% |
| Level 3 | 4.5% | 2% |
| Level 4 | 7% | 3% |

Both laws add together, with a combined ceiling of 10% of input spend. A country with both at the top setting charges 10%, not 10% plus a bit more. The settings that count are those of the country where the sector operates, and that country's treasury collects the money.

A company that cannot cover the full levy pays what cash it has. It does not go into debt for it.

## Where the money goes

The levy goes straight to the national treasury of the country that passed the law. It is not paid to suppliers, so it does not make inputs dearer for anyone else. It is booked as its own line, separate from import tariffs, and the country budget page shows the yearly automation levy once a country collects one (see [National Budget](/wiki/national-budget)). The line is shown for information only, because the cash reaches the treasury when it is collected, so it is not added to the revenue total a second time.

## What else the automation laws do

The automation tax law also keeps some workers on in automated plants: the strictest setting retains about a quarter of the crew an automation method would have shed. Other laws in the same family help displaced workers find jobs again, such as the retraining guarantee, the hiring subsidy and wage insurance. See [Labour & Wages](/wiki/labour-and-wages) for how crews and wages work.

## Planning around it

- A higher levy makes automation less attractive, so a country that wants to protect jobs can lean on it. A country that wants investment can keep it low.
- The levy is revenue, but it shrinks if companies choose other methods. Do not count on it as a steady source of income.
- If you run a company, check the levy rate of the country where the plant sits before you switch a sector to an automation method (see [Corporations](/wiki/corporations) for how methods are switched, and [Corporate R&D & Tech Trees](/wiki/corporate-r-and-d) for build time and downsides).

Applies to worlds that use the producer market. Worlds still on the older sector model have no input purchases to take the levy from, so the laws have no effect there.

Last checked 2026-11-10, version 1.20.0.
`;
