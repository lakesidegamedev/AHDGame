export interface ProducerGameConfig {
  /**
   * Funded producer market: >= 1 plans each plant's output from expected sales
   * minus held stock, so inputs and staffing follow the plan. 0 or absent = off.
   */
  producerDemandPlanStage?: number;

  /**
   * Funded producer market: >= 1 gives household orders demand
   * curves (a price ladder per good sharing one budget) and income-dependent
   * basket weights, so cheaper supply sells more units and richer households
   * shift spending toward discretionary goods; the spent share responds to the
   * prime rate. 0 or absent = off.
   */
  producerDemandCurveStage?: number;

  /**
   * Funded producer market: >= 1 re-clears household spend that was stranded in
   * sold-out lanes onto the household's other lanes with unsold supply, once, at
   * the same posted prices. 0 or absent = off.
   */
  producerSpilloverStage?: number;

  /** With producerSpilloverStage on: share (0 to 1) of stranded spend that substitutes. Absent = 0.7. */
  producerSpilloverShare?: number;

  /**
   * Funded producer market: >= 1 lets each company's own sites take its own
   * output before any outside buyer, nearest first (same state, same country,
   * anywhere eligible). 0 or absent = own fills happen in order-id sequence.
   */
  producerOwnSitesFirstStage?: number;

  /**
   * Funded producer market: >= 1 keeps a share of each public budget line's
   * unfilled money in the public wallet for the next turn (instead of burning
   * it at close), capped at four turns of the line's outlay. Support and grants
   * are paid from what is left. 0 or absent = off.
   */
  producerPublicCarryStage?: number;

  /** Share of a short line's unfilled budget kept when the stage is on. Default 0.5. */
  producerPublicCarryShare?: number;

  /**
   * Funded producer market: >= 1 lets a public line draw at most
   * half its fresh outlay from the carry each turn, holding the rest for later
   * turns, so supply landing on a long-short line does not unlock several
   * turns of budget at once. 0 or absent = off.
   */
  producerPublicCarryReleaseStage?: number;

  /**
   * Funded producer market: > 0 limits how much of last turn's run a plant may
   * shed in one turn (for example 0.15 = at most 15% a turn), so output and
   * wages follow a glut down over several turns. 0 or absent = off.
   */
  producerRunPaceDrop?: number;

  /**
   * Funded producer market: > 0 caps AI free conversions per turn at this share
   * of each country's operating capacity book value (for example 0.02). Unconverted
   * losing sectors stay in the queue for the next turn. 0 or absent = off.
   */
  producerConversionPaceShare?: number;

  /**
   * Funded producer market: > 0 keeps household income steady. Each country's
   * household transfer share is held at its first-funded-turn level, and when
   * planned household income (wages, operating payments, transfers) is under this
   * many anchor units per turn, every country's transfers rise out of its own
   * budget transfer lines until it is met. 0 or absent = off.
   */
  producerHouseholdIncomeFloor?: number;

  /**
   * Funded producer market: > 0 makes a seller mark its ask down as carried stock
   * exceeds this many turns of its recent sales (down to the market floor) and
   * write off a small share of the excess each turn. 0 or absent = off.
   */
  producerStockCover?: number;

  /**
   * Funded producer market: a private company short of cash may owe wages and
   * site bills until its payables reach this many turns of its full wage and
   * site bill (producerCreditRules). Absent = the rule's default (2); 0 = no
   * credit, companies run on cash only.
   */
  producerCreditRunTurns?: number;

  /**
   * Funded producer market: credit stops once a company's payables have gone
   * this many turns without shrinking. Absent = the rule's default (4).
   */
  producerCreditStuckTurns?: number;

  /**
   * Funded producer market: >= 1 floors each buyer's reference price for a
   * reachable good at the last funded clearing price (capped at 3x), so a country
   * whose lagged price signal is stale can still compete in a short market.
   * 0 or absent = off.
   */
  producerClearingReferenceStage?: number;

  /**
   * Funded producer market: >= 1 rebuilds each country's reachable book for the
   * price phase from the funded market's own orders and cross-border fills
   * instead of the modelled trade clearing. Receipts carry the seller and buyer
   * country so the book is measured, not inferred. 0 or absent = off.
   */
  producerFundedBookStage?: number;

  /**
   * Funded producer market: >= 1 counts orders from stateless national wallets
   * (public, military and investment buyers) in their country's national
   * supply and demand. Before, they reached the world total only, so every
   * engine reader of national demand (national price leg, margin modifier,
   * latent shortage, NPP placement for reachable goods) missed government
   * demand. State books are unchanged. 0 or absent = off.
   */
  producerNationalPublicDemandStage?: number;

  /**
   * Funded producer market: >= 1 lets each public buyer's world-book order
   * clear sellers in its own country before the ordinary book pass. Before, a
   * scarce world book went to buyers in order-id order, which for public
   * buyers is their country code, so foreign governments bought out a
   * country's own ordnance before its order came up. Needs country tags
   * (producerFundedBookStage). 0 or absent = off.
   */
  producerPublicHomeFirstStage?: number;

  /**
   * Funded producer market: >= 1 lifts the plant economy's share of GDP, which
   * scales public buying and household transfers, to a minimum so a young world
   * has demand to build into. Each higher stage raises the minimum. The money is
   * the same budget outlay the treasury already spends. 0 or absent = off.
   */
  producerDemandFloorStage?: number;

  /**
   * Funded producer market: >= 1 clears each price level of the world book
   * across public buyers together, pro rata to what each still wants, after
   * any home-first pass. Before, the leftover went to governments in order-id
   * order, which is alphabetical by country code. 0 or absent = off.
   */
  producerPublicFairShareStage?: number;

  /**
   * Funded producer market: >= 1 pays a share of the public funding left after
   * the line carry, transition support and grants to the same country's
   * households (weighted by wages) instead of burning it at close. Nothing is
   * minted; the money is the funding the treasury outlay already paid for.
   * 0 or absent = off.
   */
  producerProcurementSpillStage?: number;

  /**
   * Funded producer market: >= 1 lets a line that sold out at a profit grow by
   * its book's measured shortage (units asked over units delivered last turn),
   * at most doubling a turn, instead of a fixed step. 0 or absent = off.
   */
  producerShortageGrowthStage?: number;

  /**
   * Funded producer market: >= 1 counts a plant's own-company deliveries as
   * sales for the demand plan and zero-sales counter (at asking price for the
   * profit test), so a captive supplier is not mothballed. Settlement unchanged.
   * >= 2 values them at what own short sites bid (capped at reference, never
   * under ask). >= 3 also books own-site deliveries in the site accounts at
   * clearing price, income to seller and charge to receiver, so company totals
   * and cash are unchanged. 0 or absent = off.
   */
  producerCaptiveDeliveryStage?: number;

  /**
   * Funded producer market: >= 1 plans each product of a multi-product plant
   * on its own and runs the plant at the highest product plan whose sold lines
   * pay the plant's running cost per unit, never below the summed plan, so a
   * glut in a cheap product no longer cuts a sold-out dear one. One-product
   * plants are unchanged. >= 2 weighs that run against its marginal cost:
   * the idle upkeep a plant owes at any run is left out of the test. 0 or
   * absent = off.
   */
  producerJointRunStage?: number;

  /**
   * Funded producer market: >= 1 plans a plant's run from the share it planned
   * last turn, not only what it made, so a run cut by short inputs or cash does
   * not lower the next plan; a plant that sold out at a profit grows by a fixed
   * step of capacity a turn; and only a second glut turn in a row drops a plant
   * to its floor (one glut turn steps it down). >= 2: the never-below-last-
   * turn's-sales floor subtracts stock held beyond producerStockCover turns of
   * sales, so a plant sitting on a pile sells from it instead of making more.
   * >= 3: a line whose sold units lost money after inputs, wages and site costs
   * steps down a cut a turn, below last turn's sales if need be.
   * 0 or absent = off.
   */
  producerRunPlanStage?: number;

  /**
   * Funded producer market: 1 charges import tariffs on cross-border sales.
   * A buyer sees the landed price (posted price plus the importer's tariff)
   * when deciding to buy, each sale pays the tariff to the importing country,
   * and the turn moves it into that country's treasury cash. Turning it on
   * also closes routes a full naval blockade shuts. Needs
   * producerFundedBookStage >= 1 so every order and offer knows its country.
   * 0 or absent = off.
   */
  producerTariffStage?: 0 | 1;

  /**
   * Funded producer market: >= 1 judges whether a cash-short company's run
   * pays for itself (the sales advance) with its inputs at last turn's
   * clearing price, never above the bid ceiling, instead of at the ceiling.
   * At the ceiling a run whose sales clearly cover it read as losing money,
   * so a company that spent its cash on construction stayed held to that cash
   * turn after turn. The advance stays capped by the run's expected revenue.
   * 0 or absent = off.
   */
  producerSalesAdvancePriceStage?: number;

  /**
   * Funded producer market: >= 1 lets an idle plant of a company that cannot
   * fund a run, and that sold nothing last turn, run a small probe (5% of its
   * capacity) on intra-turn credit against its output's market price, when
   * other buyers have funded demand for that output and the probe pays for
   * itself at market input prices. The probe's sales repay the credit in the
   * same settlement; what they do not cover stays an ordinary payable. A plant
   * stops probing after 3 probe turns in a row that did not pay for
   * themselves (restartProbeRules). 0 or absent = off.
   */
  producerZombieRestartStage?: number;

  /**
   * Funded producer market: >= 1 makes a household's basket budget its spend
   * share of this turn's wages plus producerHouseholdSavingsDrawShare of the
   * rest of its cash, instead of its spend share of all its cash, so money it
   * could not spend in a shortage is not budgeted again every turn
   * (householdSpendRules). 0 or absent = off.
   */
  producerHouseholdIncomeSpendStage?: number;

  /** Share of savings a household spends each turn under producerHouseholdIncomeSpendStage. Absent = 0.3. */
  producerHouseholdSavingsDrawShare?: number;

  /**
   * Funded producer market: >= 1 lets an automatic seller that sold out last
   * turn, in a lane where buyers asked for more than they got, ask a step above
   * last turn's clearing price instead of at it (shortageAskRules). The step is
   * 0.25 x (requested / delivered - 1), capped by producerShortageAskMaxStep,
   * and the ask never passes reference x producerPriceMaxMultiplier. >= 2: a
   * seller that sold out steps from the higher of the clearing and its own last
   * ask, so a cheap seller's share of the average cannot pin the lane. 0 or
   * absent = off.
   */
  producerShortageAskStage?: number;

  /** Largest raise in one turn under producerShortageAskStage. Absent = 0.05. */
  producerShortageAskMaxStep?: number;

  /**
   * Share of a run's expected sales a company may borrow against to run on
   * little or no cash (salesAdvanceRules). Inside (0, 1]; absent = 0.9.
   */
  producerSalesAdvanceRevenueShare?: number;

  /**
   * Funded producer market: >= 1 makes an automatic seller choose, among asks
   * within 1% of its best expected profit, the one the most buyers can pay
   * (quoteProducer buyerTieBreak). Stops a whole lane posting a hair above a
   * household ceiling and selling nothing to households. >= 2: the seller's
   * sales estimate also assumes competitors quoted at or above a price will
   * match it. 0 or absent = off.
   */
  producerAskBuyerTieStage?: number;
  /**
   * Seller preference stage: >= 1 makes a free-choice buyer order split across
   * every eligible seller, leaning toward cheaper offers, instead of the
   * cheapest seller taking everything. >= 2 also weighs brand loyalty and
   * quality. 0 or absent = off.
   */
  producerSellerPreferenceStage?: number;

  /**
   * Automatic build room stage: >= 1 makes every automatic capacity decision
   * (autopilot and computer-run companies) build only where buyers have unmet
   * demand for the sector's output, the same room the build dialog shows.
   * Shortage-led growth is unchanged. 0 or absent = off.
   */
  autopilotBuildRoomStage?: number;

  /**
   * Market share basis stage: >= 1 measures market size, share and the
   * dominance mechanic on earned revenue instead of capacity revenue. 0 or
   * absent = off.
   */
  marketShareEarnedStage?: number;

  /**
   * Funded producer market: >= 1 lets an AI owner reopen one mothballed plant a
   * turn whose recipe's running plants face a measured shortage (units asked
   * over delivered at least 1.5), instead of waiting on the legacy price
   * ratio. 0 or absent = off.
   */
  producerFundedRestartStage?: number;

  /** Share (0 to 1) of that leftover paid to households when the stage is on. Absent = 1. */
  producerProcurementSpillShare?: number;

  /**
   * Funded producer market: >= 1 raises a plant's wages toward
   * producerWageShareTarget of the value it added last turn, taking at most
   * producerWageShareSurplusCap of the surplus left after base wages and site
   * bills, so households earn more of what plants make and no plant is pushed
   * into a loss on last turn's numbers (wageShareRules.ts). 0 or absent = off.
   */
  producerWageShareStage?: number;

  /** Target wage share (0 to 1) of value added with the stage on. Absent = 0.6. */
  producerWageShareTarget?: number;

  /** Largest share (0 to 1) of surplus after base wages the raise takes. Absent = 0.75. */
  producerWageShareSurplusCap?: number;

  /**
   * Funded producer market: >= 1 sets each plant's wage share target from its
   * state's unemployment instead of producerWageShareTarget (turns the wage
   * share raise on by itself), moving at most producerLabourWageStep a turn,
   * and builds every country's economicFactors.wageGrowth from its states'
   * labour markets (wageShareRules.ts). 0 or absent = off.
   */
  producerLabourWageStage?: number;

  /** Unemployment (%) at or below which the target is at its maximum. Absent = 4.5. */
  producerLabourWageNaturalRate?: number;

  /** Unemployment (%) at or above which the target is at its floor. Absent = 12. */
  producerLabourWageSlackRate?: number;

  /** Target wage share (0 to 1) in a tight labour market. Absent = 0.55. */
  producerLabourWageMaxShare?: number;

  /** Target wage share (0 to 1) in a slack labour market. Absent = 0.3. */
  producerLabourWageFloorShare?: number;

  /** Largest move of a plant's effective target a turn (share of value added). Absent = 0.03. */
  producerLabourWageStep?: number;

  /**
   * Funded producer market: >= 1 retires, with no cash, a share of the
   * capacity of plants that have sold nothing for several turns. 0 or absent = off.
   */
  producerIdleRetireStage?: number;

  /**
   * Funded producer market transition package (classification of over-built
   * sectors at the opening, struggling marks, support and free conversion for
   * 48 turns after the switch). Absent or true = on. False = no package: an
   * economy rebuilt from the seed has nothing to land softly, so its window is
   * treated as already closed and idle retirement runs from the first turn.
   */
  producerTransitionPackageEnabled?: boolean;

  /**
   * Funded producer market: between 0 and 1, the remaining build time of each
   * outstanding order in a plant whose output is short (measured on the
   * funded book) is multiplied by this once. Absent or 1 = off. A fresh world
   * starts far short of real demand, and 24 to 96 turn builds leave it short
   * for days; the economy-only reset sets this.
   */
  producerShortageBuildFactor?: number;

  /** Funded-turn price pace: largest per-turn move of a scarcity multiplier. Absent = 0.06. */
  producerPriceMaxMove?: number;

  /** Funded-turn price ceiling: largest scarcity multiplier. Absent = 10. */
  producerPriceMaxMultiplier?: number;

  /**
   * Funded producer market: >= 1 replaces the hard ceiling at
   * producerPriceMaxMultiplier with a soft one: the target price is softened
   * above SOFT_CEILING_KNEE of the ceiling before the pace bound applies, so it
   * approaches the ceiling instead of piling up on it and goods in different
   * shortages stop publishing the same pinned price. 0 or absent = off.
   */
  producerSoftPriceCeilingStage?: number;

  /**
   * Funded producer market: >= 1 lets a plant that sells almost nothing run
   * and staff a 1% probe instead of 10%, and cuts upkeep on parked and idle
   * capacity to a tenth. 0 or absent = off.
   */
  producerLowUseCostStage?: number;

  /**
   * Run the unified producer market in memory each turn beside the live engine
   * and record a per-industry comparison in `producerMarketShadows`. Telemetry
   * only: moves no money and writes no sector or corporation.
   */
  producerMarketShadowEnabled?: boolean;

  /**
   * First turn the funded producer market settles live (funded-market cutover).
   * Unset keeps the legacy engine. Requires the opening conversion marker on the
   * previous turn; once a funded turn has run, the world cannot return to
   * legacy. See src/lib/market/producerMarket/liveMode.ts.
   */
  producerMarketLiveFromTurn?: number;
}
