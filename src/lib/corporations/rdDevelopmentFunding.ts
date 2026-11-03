import type { Db } from "mongodb";
import { getMarketSystemMode, marketAtLeast } from "@/lib/market/featureFlag";
import type { GameConfig } from "@/lib/db/types";
import { getManufacturingProductKind } from "@/lib/products/manufacturingCatalog";
import {
  MANUFACTURING_PRODUCT_PROJECTS_V2,
  type ManufacturingProductProject,
} from "@/lib/products/manufacturingProject";
import { MEDIA_PRODUCT_PROJECTS, type MediaProductProject } from "@/lib/products/mediaProduct";
import type { RdDevelopmentProject } from "./strengthProjection";

export interface RdDevelopmentFundingProject extends RdDevelopmentProject {
  /** Player-facing product name. */
  label: string;
}

/**
 * The active product projects the turn pays from a corporation's R&D budget
 * before any generic research (the same two slots the turn loads). Display only.
 */
export async function loadRdDevelopmentProjects(
  db: Db,
  corporationId: string
): Promise<RdDevelopmentFundingProject[]> {
  const config = await db.collection<GameConfig>("gameConfig").findOne(
    { _id: "default" },
    {
      projection: {
        marketSystemMode: 1,
        productLinesV2Enabled: 1,
        mediaProductSlatesEnabled: 1,
      },
    }
  );
  const manufacturingOn =
    config?.productLinesV2Enabled === true &&
    marketAtLeast(await getMarketSystemMode(config), "plants");
  const mediaOn = config?.mediaProductSlatesEnabled === true;

  const [manufacturing, media] = await Promise.all([
    manufacturingOn
      ? db
          .collection<ManufacturingProductProject>(MANUFACTURING_PRODUCT_PROJECTS_V2)
          .findOne({ activeCorporationId: corporationId, corporationId })
      : null,
    mediaOn
      ? db
          .collection<MediaProductProject>(MEDIA_PRODUCT_PROJECTS)
          .findOne({ activeDevelopmentCorporationId: corporationId, corporationId })
      : null,
  ]);

  const projects: RdDevelopmentFundingProject[] = [];
  if (manufacturing) {
    projects.push({
      id: manufacturing._id,
      stage: manufacturing.stage,
      paidAnchor: manufacturing.developmentPaidAnchor,
      thresholdAnchor: manufacturing.paidThresholdAnchor,
      label: getManufacturingProductKind(manufacturing.kindId)?.label ?? "product",
    });
  }
  if (media) {
    projects.push({
      id: media._id,
      stage: media.stage,
      paidAnchor: media.developmentPaidAnchor,
      thresholdAnchor: media.paidThresholdAnchor,
      label: media.title || "media product",
    });
  }
  return projects;
}
