/**
 * The 2027 broadcast lander's content: headlines from the world's long run to
 * 2050, each tied to the place it is filed from. The globe's satellites beam
 * down to those datelines and name them.
 *
 * Unlike a historical era, this feed is the calendar a 2027 world plays
 * through: the shared moments every world gets, the laws and research tiers
 * that open in set years, and the crises a country can meet along the way.
 */
import type { BroadcastTickerItem } from "./eraThemes";
import type { HistoricalCrisisShowcaseEntry } from "./historicalCrisisShowcase";

const PLACES = {
  ottawa: { name: "Ottawa", lonLat: [-75.7, 45.42] },
  quebecCity: { name: "Quebec City", lonLat: [-71.21, 46.81] },
  houston: { name: "Houston", lonLat: [-95.37, 29.76] },
  frankfurt: { name: "Frankfurt", lonLat: [8.68, 50.11] },
  westernPacific: { name: "Western Pacific", lonLat: [123, 24] },
  detroit: { name: "Detroit", lonLat: [-83.05, 42.33] },
  montevideo: { name: "Montevideo", lonLat: [-56.19, -34.9] },
  beijing: { name: "Beijing", lonLat: [116.4, 39.9] },
  tokyo: { name: "Tokyo", lonLat: [139.69, 35.69] },
  tromso: { name: "Tromso", lonLat: [18.96, 69.65] },
  shenzhen: { name: "Shenzhen", lonLat: [114.06, 22.54] },
  capeCanaveral: { name: "Cape Canaveral", lonLat: [-80.6, 28.39] },
  berlin: { name: "Berlin", lonLat: [13.4, 52.52] },
  seoul: { name: "Seoul", lonLat: [126.98, 37.57] },
  newYork: { name: "New York", lonLat: [-74, 40.71] },
} as const;

/** Oldest first. The last item has no dateline: it is filed from orbit. */
export const TICKER_2027: readonly BroadcastTickerItem[] = [
  {
    date: "Jan 2027",
    text: "Canada opens to players alongside the United States",
    place: PLACES.ottawa,
  },
  { date: "2028", text: "Humans return to the Moon", place: PLACES.houston },
  {
    date: "2028",
    text: "Cyberattacks begin to test power grids and networks",
    place: PLACES.frankfurt,
  },
  {
    date: "2029",
    text: "AI layoffs force a choice between retraining and a robot tax",
    place: PLACES.detroit,
  },
  { date: "2030", text: "The World Cup marks a hundred years", place: PLACES.montevideo },
  {
    date: "2030",
    text: "Parliaments take up the automation tax and wage insurance",
    place: PLACES.beijing,
  },
  {
    date: "2035",
    text: "The first commercial fusion plant is switched on",
    place: PLACES.tokyo,
  },
  {
    date: "2039",
    text: "A new research tier opens fresh production methods in every sector",
    place: PLACES.shenzhen,
  },
  {
    date: "2040",
    text: "The first crewed mission leaves for Mars",
    place: PLACES.capeCanaveral,
  },
  { date: "2045", text: "The world marks a hundred years since 1945", place: PLACES.berlin },
  {
    date: "2049",
    text: "The 2049 research tier opens another round of new methods",
    place: PLACES.seoul,
  },
  {
    date: "2050",
    text: "The half-century mark brings a worldwide look back",
    place: PLACES.newYork,
  },
  { date: "In orbit", text: "Orbital debris is knocking out satellite services" },
];

/** A place's coordinates as the mutable pair the globe's d3 calls take. */
const at = (place: { lonLat: readonly [number, number] }): [number, number] => [
  place.lonLat[0],
  place.lonLat[1],
];

/**
 * The globe's idle tour for a 2027 world: the years ahead at their datelines,
 * in date order, instead of the Cold War tour that opens on 1953.
 */
export const SHOWCASE_2027: readonly HistoricalCrisisShowcaseEntry[] = [
  {
    id: "canada-opens-2027",
    year: 2027,
    lonLat: at(PLACES.ottawa),
    countryId: "CA",
    title: "Canada opens to players",
    description:
      "A new 2027 world opens with Canada playable beside the United States. Players can run for the House of Commons, found corporations and trade in Canadian dollars.",
  },
  {
    id: "quebec-referendum-2027",
    year: 2027,
    lonLat: at(PLACES.quebecCity),
    countryId: "CA",
    title: "The Quebec question",
    description:
      "Once Quebec's desire for sovereignty is high enough, its Premier can ask for a referendum. If Yes wins and the House of Commons consents, Quebec becomes its own country.",
  },
  {
    id: "arctic-agreement-2027",
    year: 2027,
    lonLat: at(PLACES.tromso),
    title: "Treaties change who trades with whom",
    description:
      "While the Arctic Agreement or the Critical Minerals Club has terms in force, its members send more of their surplus to each other and pay a little less for it. Sanctions still close trade outright.",
  },
  {
    id: "moon-return-2028",
    year: 2028,
    lonLat: at(PLACES.houston),
    title: "Footprints again",
    description:
      "Between 2028 and 2029 every world shares the return to the Moon, with the same live broadcast and the same decision on how to watch it.",
  },
  {
    id: "pacific-strait-2028",
    year: 2028,
    lonLat: at(PLACES.westernPacific),
    title: "A strait crisis in the Pacific",
    description:
      "When world tension runs high, a confrontation between China and the United States can climb from posturing to a shipping quarantine. Every step has a way out through talks, but it cuts electronics output while it lasts.",
  },
  {
    id: "grid-cyberattacks-2028",
    year: 2028,
    lonLat: at(PLACES.frankfurt),
    title: "Cyber operations",
    description:
      "Governments can launch cyber operations against each other. A strong target resists, a weak one loses power and output, and the victim may trace the attack and name who sent it.",
  },
  {
    id: "ai-labour-shock-2029",
    year: 2029,
    lonLat: at(PLACES.detroit),
    countryId: "US",
    title: "The AI labour shock",
    description:
      "Where automation is widespread and unemployment is rising, a wave of AI layoffs can hit. Leaders choose retraining, wage insurance, a robot tax or letting the market adjust.",
  },
  {
    id: "world-cup-2030",
    year: 2030,
    lonLat: at(PLACES.montevideo),
    title: "A hundred years of the World Cup",
    description:
      "The tournament marks a century since the first final. Players choose whether to host a screening, watch at home or place a bet.",
  },
  {
    id: "fusion-2035",
    year: 2035,
    lonLat: at(PLACES.tokyo),
    title: "The first commercial fusion attempt",
    description:
      "Around 2035 a commercial fusion plant is switched on for the first time. Players choose whether to cheer it on, watch carefully or worry about the energy bill.",
  },
  {
    id: "research-tier-2039",
    year: 2039,
    lonLat: at(PLACES.shenzhen),
    title: "A new research tier",
    description:
      "The 2039 tier gives every sector a new production method, from autonomous deep mining to solid-state vehicles. Countries with less ready industry adopt each one years after the leaders.",
  },
  {
    id: "mars-2040",
    year: 2040,
    lonLat: at(PLACES.capeCanaveral),
    title: "Departure for Mars",
    description:
      "Around 2040 the first crewed mission to Mars leaves Earth orbit. Players choose whether to gather and watch, follow at home or voice doubt.",
  },
  {
    id: "centenary-1945-2045",
    year: 2045,
    lonLat: at(PLACES.berlin),
    title: "A hundred years since 1945",
    description:
      "The world marks the centenary of the end of the Second World War. The same year new laws open on long-term care, fossil fuel sunsets, digital self-ownership and water security.",
  },
  {
    id: "half-century-2050",
    year: 2050,
    lonLat: at(PLACES.newYork),
    title: "The half-century mark",
    description:
      "The year 2050 opens with a worldwide look back at the century so far. Advanced AI oversight, a zero carbon economy and space resources arrive as new laws.",
  },
];
