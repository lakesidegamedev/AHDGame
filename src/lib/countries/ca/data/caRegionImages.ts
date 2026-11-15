/**
 * Representative hero images for Canada's provinces and territories (Wikimedia
 * Commons via the stable Special:FilePath redirect). Keyed by the bare public
 * code; storage ids (`CA_ON`) and public codes (`ON`) both resolve.
 * Scenery and buildings only, no people.
 */
const fp = (file: string) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=1280`;

const CA_REGION_IMAGES: Record<string, string> = {
  // Toronto skyline from Centre Island. CC BY-SA 4.0.
  ON: fp("Toronto Skyline from Centre Island.jpg"),
  // Chateau Frontenac at dusk, Quebec City. CC0.
  QC: fp("Chateau Frontenac at dusk in Quebec City.jpg"),
  // Vancouver skyline. CC BY 4.0.
  BC: fp("Skyline of Vancouver, BC.jpg"),
  // Moraine Lake, Banff National Park. Public domain.
  AB: fp("Moraine Lake 17092005.jpg"),
  // Manitoba Legislative Building, Winnipeg. CC BY 2.0.
  MB: fp("Manitoba Legislative Building July 2024.jpg"),
  // Saskatchewan Legislative Building, Regina. CC BY-SA 2.0.
  SK: fp("Saskatchewan Legislative Building.jpg"),
  // Peggys Cove lighthouse. CC BY-SA 3.0.
  NS: fp("Peggys Cove Lighthouse.jpg"),
  // Hopewell Rocks, Bay of Fundy. CC BY-SA 4.0.
  NB: fp("Hopewell Rocks.jpg"),
  // Signal Hill over St. John's harbour. CC BY 2.0.
  NL: fp("Signal Hill St John Harbour Newfoundland (41364644211).jpg"),
  // Seacow Head lighthouse. CC BY-SA 2.0.
  PE: fp("Seacow Head Lighthouse (2015-10).jpg"),
  // Emerald Lake. CC BY-SA 3.0.
  YT: fp("Emerald Lake, Yukon.jpg"),
  // Yellowknife. Public domain.
  NT: fp("Yellowknife.jpg"),
  // Iqaluit. CC BY 4.0.
  NU: fp("Iqaluit, Nunavut.jpg"),
};

const CA_DEFAULT_IMAGE = CA_REGION_IMAGES.ON;

export function getCARegionImage(regionId: string): string {
  const code = regionId.toUpperCase().replace(/^CA_/, "");
  return CA_REGION_IMAGES[code] ?? CA_DEFAULT_IMAGE;
}
