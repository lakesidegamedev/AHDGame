import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { createSystemNewsPost } from "@/lib/news";
import { logger } from "@/lib/observability/logger";
import {
  buildSuccessionNews,
  type SuccessionNewsInput,
} from "@/lib/elections/rules/successionNews";

/** Post a succession step to the wire. Never throws: news must not fail a turn. */
export async function postSuccessionNews(
  countryId: CountryId,
  input: Omit<SuccessionNewsInput, "countryName">
): Promise<void> {
  try {
    const { title, content } = buildSuccessionNews({
      ...input,
      countryName: COUNTRY_CONFIGS[countryId]?.name ?? countryId,
    });
    await createSystemNewsPost(content, "executive", { title });
  } catch (err) {
    logger.warn("Turn", `Succession news failed for ${countryId}`, { error: String(err) });
  }
}
