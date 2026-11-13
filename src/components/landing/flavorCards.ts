/**
 * Era-specific flavor cards for the homepage carousel.
 * Historical eras get 3 static "leader" cards, present-day eras a set of
 * briefs, and live crises follow as dynamic cards.
 *
 * Portrait licensing: this is a public landing page, so every image slug must
 * have a documented free license before the asset is uploaded to the CDN.
 * Licensed slugs:
 *   bush   Commons "George H. W. Bush presidential portrait.jpg", David Valdez / White House, public domain
 *   deng   Commons "Deng Xiaoping.jpg", public domain
 *   major  Commons "John Major 1996.jpg", PFC Tracey L. Hall-Leahy, USA, public domain
 *
 * All other slugs have no CDN asset and render without an image. Do not
 * upload portraits for them without recording a public-domain/CC source here
 * first and adding the slug to FLAVOR_CARD_PORTRAITS.
 */

/**
 * Slugs with a portrait on the CDN: the licensed rows of the table above. A
 * card whose slug is missing here draws no image at all, rather than asking
 * the CDN for one and logging a failed request on every landing load.
 */
export const FLAVOR_CARD_PORTRAITS: ReadonlySet<string> = new Set(["bush", "deng", "major"]);

export type FlavorCard = {
  id: string;
  /** A leader's name, or a brief's headline. */
  name: string;
  title: string;
  country: string;
  countryCode: string;
  /** A leader's words, or a brief's body. Only a leader's are set as a quotation. */
  quote: string;
  imageSlug: string;
  year: string;
  /**
   * A brief on the world's pressures instead of a leader. Present-day worlds
   * use these: every politician in them is fictional, so there is no one real
   * to quote.
   */
  kind?: "brief";
};

/** The 2027 briefs, from the 1.20 release notes and the 2027 seed. */
const BRIEFS_2027: FlavorCard[] = [
  {
    id: "brief-2027-automation",
    kind: "brief",
    name: "Automation and work",
    title: "Automation tax, wage insurance, retraining",
    country: "Every country",
    countryCode: "",
    quote:
      "Where automation is widespread and unemployment is rising, a wave of AI layoffs can hit. Laws for 2027 and 2030 add an automation tax and wage insurance, and the 2030s bring a fight over who pays: retraining, a hiring subsidy or an automation pension levy.",
    imageSlug: "",
    year: "2029",
  },
  {
    id: "brief-2027-ageing",
    kind: "brief",
    name: "An ageing population",
    title: "Dependency ratio, longevity care",
    country: "Every country",
    countryCode: "",
    quote:
      "The world starts with a realistic oldest age and dependency ratio, and births and life expectancy follow each country's trend to 2050. A longevity care law opens in 2045, and computer-run politicians age and retire from 70.",
    imageSlug: "",
    year: "2045",
  },
  {
    id: "brief-2027-climate",
    kind: "brief",
    name: "Climate pressure",
    title: "Drought, migration, carbon border",
    country: "Every country",
    countryCode: "",
    quote:
      "Climate pressure builds every year. A megadrought can strike from 2031 and climate migration from 2035. A carbon border adjustment is among the laws for 2027 and 2030, fossil fuel sunsets follow in 2045 and a zero carbon economy in 2050.",
    imageSlug: "",
    year: "2031",
  },
  {
    id: "brief-2027-cyber",
    kind: "brief",
    name: "Cyber operations",
    title: "From the intelligence console",
    country: "Every country",
    countryCode: "",
    quote:
      "The head of intelligence can launch an operation against another country. Your cyber strength is set against the target's resilience, a score from 0 to 1. A success cuts its power and output; a traced one raises world tension and costs the sender approval.",
    imageSlug: "",
    year: "2028",
  },
  {
    id: "brief-2027-canada",
    kind: "brief",
    name: "Canada and Quebec",
    title: "343 MPs, 13 provinces and territories",
    country: "Canada",
    countryCode: "CA",
    quote:
      "Canada opens beside the United States with a 343-seat House of Commons, 778 provincial seats and a nineteen seat cabinet. Once Quebec's Sovereignty Desire reaches 60 its Premier can request a referendum, and a Yes can make Quebec a country.",
    imageSlug: "",
    year: "2027",
  },
  {
    id: "brief-2027-calendar",
    kind: "brief",
    name: "The calendar to 2050",
    title: "One real hour is one game week",
    country: "Every country",
    countryCode: "",
    quote:
      "New laws arrive in 2035, 2040, 2045 and 2050, research tiers open in 2039 and 2049, and the calendar holds a second pandemic, the Arctic, resistant infections, orbital debris and a fusion breakthrough.",
    imageSlug: "",
    year: "2050",
  },
];

export const ERA_FLAVOR_CARDS: Record<string, FlavorCard[]> = {
  "1953": [
    {
      id: "eisenhower",
      name: "Dwight D. Eisenhower",
      title: "President of the United States",
      country: "United States",
      countryCode: "US",
      quote:
        "The middle of the road is all of the usable surface. The extremes, right and left, are in the gutters.",
      imageSlug: "eisenhower",
      year: "1953",
    },
    {
      id: "churchill",
      name: "Winston Churchill",
      title: "Prime Minister of the United Kingdom",
      country: "United Kingdom",
      countryCode: "UK",
      quote: "To jaw-jaw is always better than to war-war.",
      imageSlug: "churchill",
      year: "1953",
    },
    {
      id: "malenkov",
      name: "Georgy Malenkov",
      title: "Chairman of the Council of Ministers of the USSR",
      country: "Soviet Union",
      countryCode: "RU",
      quote: "Nuclear war would mean the destruction of world civilization.",
      imageSlug: "malenkov",
      year: "1953",
    },
  ],
  "1979": [
    {
      id: "carter",
      name: "Jimmy Carter",
      title: "President of the United States",
      country: "United States",
      countryCode: "US",
      quote:
        "We become not a melting pot but a beautiful mosaic. Different people, different beliefs, different yearnings, different hopes, different dreams.",
      imageSlug: "carter",
      year: "1979",
    },
    {
      id: "callaghan",
      name: "James Callaghan",
      title: "Prime Minister of the United Kingdom",
      country: "United Kingdom",
      countryCode: "UK",
      quote: "A lie can be halfway round the world before the truth has got its boots on.",
      imageSlug: "callaghan",
      year: "1979",
    },
    {
      id: "deng-1979",
      name: "Deng Xiaoping",
      title: "Paramount Leader of China",
      country: "China",
      countryCode: "CN",
      quote: "It doesn't matter whether a cat is black or white, as long as it catches mice.",
      imageSlug: "deng",
      year: "1979",
    },
  ],
  "1991": [
    {
      id: "bush",
      name: "George H.W. Bush",
      title: "President of the United States",
      country: "United States",
      countryCode: "US",
      quote:
        "Read my lips: no new taxes. But this is a time of transformation, and the world is changing faster than our politics can keep up.",
      imageSlug: "bush",
      year: "1991",
    },
    {
      id: "major",
      name: "John Major",
      title: "Prime Minister of the United Kingdom",
      country: "United Kingdom",
      countryCode: "UK",
      quote:
        "A nation at ease with itself. A country that is confident and prepared to meet the challenges of the future.",
      imageSlug: "major",
      year: "1991",
    },
    {
      id: "deng-1991",
      name: "Deng Xiaoping",
      title: "Paramount Leader of China",
      country: "China",
      countryCode: "CN",
      quote: "Development is the absolute principle. Keep a cool head and maintain a low profile.",
      imageSlug: "deng",
      year: "1991",
    },
  ],
  "1999": [
    {
      id: "clinton",
      name: "Bill Clinton",
      title: "President of the United States",
      country: "United States",
      countryCode: "US",
      quote:
        "The era of big government is over. But we cannot go back to the time when our citizens were left to fend for themselves.",
      imageSlug: "clinton",
      year: "1999",
    },
    {
      id: "blair",
      name: "Tony Blair",
      title: "Prime Minister of the United Kingdom",
      country: "United Kingdom",
      countryCode: "UK",
      quote: "Education, education, education. The key to the future of a modern Britain.",
      imageSlug: "blair",
      year: "1999",
    },
    {
      id: "jiang",
      name: "Jiang Zemin",
      title: "General Secretary of the Communist Party",
      country: "China",
      countryCode: "CN",
      quote:
        "The important thing is to seize the opportunity to develop the economy. We must not miss the boat.",
      imageSlug: "jiang",
      year: "1999",
    },
  ],
  "2007": [
    {
      id: "bush-2007",
      name: "George W. Bush",
      title: "President of the United States",
      country: "United States",
      countryCode: "US",
      quote:
        "We're fighting them over there so we don't have to fight them here. The surge is working.",
      imageSlug: "bush-jr",
      year: "2007",
    },
    {
      id: "brown",
      name: "Gordon Brown",
      title: "Prime Minister of the United Kingdom",
      country: "United Kingdom",
      countryCode: "UK",
      quote:
        "This is no time for a novice. We have shown that we can steer Britain through the storm.",
      imageSlug: "brown",
      year: "2007",
    },
    {
      id: "hu",
      name: "Hu Jintao",
      title: "General Secretary of the Communist Party",
      country: "China",
      countryCode: "CN",
      quote:
        "A harmonious society is the foundation of sustainable development. We must build socialism with Chinese characteristics.",
      imageSlug: "hu",
      year: "2007",
    },
  ],
  "2019": [
    {
      id: "trump",
      name: "Donald Trump",
      title: "President of the United States",
      country: "United States",
      countryCode: "US",
      quote:
        "America First. We will make America great again, and we are winning like never before.",
      imageSlug: "trump",
      year: "2019",
    },
    {
      id: "may",
      name: "Theresa May",
      title: "Prime Minister of the United Kingdom",
      country: "United Kingdom",
      countryCode: "UK",
      quote:
        "Brexit means Brexit, and we are going to make a success of it. No deal is better than a bad deal.",
      imageSlug: "may",
      year: "2019",
    },
    {
      id: "xi-2019",
      name: "Xi Jinping",
      title: "General Secretary of the Communist Party",
      country: "China",
      countryCode: "CN",
      quote: "The great rejuvenation of the Chinese nation is within reach. No force can stop us.",
      imageSlug: "xi",
      year: "2019",
    },
  ],
  "2023": [
    {
      id: "biden",
      name: "Joe Biden",
      title: "President of the United States",
      country: "United States",
      countryCode: "US",
      quote:
        "We are the United States of America, and there is nothing beyond our capacity. Democracy is not a spectator sport.",
      imageSlug: "biden",
      year: "2023",
    },
    {
      id: "sunak",
      name: "Rishi Sunak",
      title: "Prime Minister of the United Kingdom",
      country: "United Kingdom",
      countryCode: "UK",
      quote:
        "We will create a future that is built on innovation, powered by technology, and driven by the British people.",
      imageSlug: "sunak",
      year: "2023",
    },
    {
      id: "xi-2023",
      name: "Xi Jinping",
      title: "General Secretary of the Communist Party",
      country: "China",
      countryCode: "CN",
      quote:
        "Chinese modernization is the path to building a great modern socialist country. We will unwaveringly follow this path.",
      imageSlug: "xi",
      year: "2023",
    },
  ],
};

ERA_FLAVOR_CARDS["2027"] = BRIEFS_2027;

/** Get flavor cards for an era, falling back to 1979. */
export function getEraFlavorCards(year: number | string): FlavorCard[] {
  const key = String(year);
  return ERA_FLAVOR_CARDS[key] ?? ERA_FLAVOR_CARDS["1979"];
}
