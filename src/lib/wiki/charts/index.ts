import type { WikiChartBuilder, WikiChartSpec } from "./types";
import { ECONOMY_CHARTS } from "./economy";
import { ECONOMY_CORP_CHARTS } from "./economyCorp";
import { ELECTIONS_CHARTS } from "./elections";
import { GENERAL_CHARTS } from "./general";
import { LEGISLATURE_CHARTS } from "./legislature";
import { MILITARY_CHARTS } from "./military";
import { PARTIES_CHARTS } from "./parties";

export type { WikiChartSpec, WikiChartBuilder } from "./types";

/** Every wiki chart by id. Series are computed from game constants on demand. */
export const WIKI_CHARTS: Record<string, WikiChartBuilder> = {
  ...ECONOMY_CHARTS,
  ...ECONOMY_CORP_CHARTS,
  ...ELECTIONS_CHARTS,
  ...GENERAL_CHARTS,
  ...LEGISLATURE_CHARTS,
  ...MILITARY_CHARTS,
  ...PARTIES_CHARTS,
};

export function buildWikiChart(id: string): WikiChartSpec | null {
  const build = Object.prototype.hasOwnProperty.call(WIKI_CHARTS, id) ? WIKI_CHARTS[id] : undefined;
  return build ? build() : null;
}
