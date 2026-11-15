import type { Db } from "mongodb";
import { getMarketSystemMode, marketAtLeast } from "@/lib/market/featureFlag";
import { getManufacturingProductKind } from "@/lib/products/manufacturingCatalog";
import { type ManufacturingProductProject } from "@/lib/products/manufacturingProject";
import { type MediaProductProject } from "@/lib/products/mediaProduct";
import type { RdDevelopmentProject } from "./strengthProjection";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { mediaProductProjectsV1Collection } from "@/lib/db/repositories/mediaProductProjectsV1";
import { manufacturingProductProjectsV2Collection } from "@/lib/db/repositories/manufacturingProductProjectsV2";

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
  const config = await gameConfigCollection(db).findOne(
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
      ? manufacturingProductProjectsV2Collection<ManufacturingProductProject>(db).findOne({
          activeCorporationId: corporationId,
          corporationId,
        })
      : null,
    mediaOn
      ? mediaProductProjectsV1Collection<MediaProductProject>(db).findOne({
          activeDevelopmentCorporationId: corporationId,
          corporationId,
        })
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
