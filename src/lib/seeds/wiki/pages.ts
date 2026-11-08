import type { WikiSeedPage } from "./types";
import { gettingStartedPages } from "./pages/gettingStarted";
import { electionsPages } from "./pages/elections";
import { legislaturesPages } from "./pages/legislatures";
import { partiesPages } from "./pages/parties";
import { countriesPages } from "./pages/countries";
import { militaryPages } from "./pages/military";
import { economyPages } from "./pages/economy";
import { advancedPages } from "./pages/advanced";
import { resourcesPages } from "./pages/resources";
import { commoditiesPages } from "./pages/commodities";
import { iterationsPages } from "./pages/iterations";

/**
 * Aggregated wiki page seeds. Category files in `./pages/*.ts` each export a
 * `readonly WikiSeedPage[]`; concatenated here into `WIKI_SEED_PAGES` consumed
 * by `seedWikiPages`. Wiki is public only when `wikiDisabled` is false.
 */
export const WIKI_SEED_PAGES: readonly WikiSeedPage[] = [
  ...gettingStartedPages,
  ...electionsPages,
  ...legislaturesPages,
  ...partiesPages,
  ...countriesPages,
  ...militaryPages,
  ...economyPages,
  ...advancedPages,
  ...resourcesPages,
  ...commoditiesPages,
  ...iterationsPages,
];
