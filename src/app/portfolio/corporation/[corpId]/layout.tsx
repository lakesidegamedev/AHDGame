import { CDN_LOGO_URL } from "@/lib/images/staticCdnAssets";
import type { Metadata } from "next";
import { getDb } from "@/lib/mongodb";
import { getSiteUrl } from "@/lib/siteMetadata";
import { corporationQueryFromParamId } from "@/lib/api/corporations/resolveQuery";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ corpId: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ corpId: string }>;
}): Promise<Metadata> {
  const { corpId } = await params;
  const query = corporationQueryFromParamId(corpId);
  if (!query) return {};

  const db = await getDb();
  const corp = await corporationsCollection(db).findOne(query, {
    projection: { name: 1, logoUrl: 1 },
  });
  if (!corp) return {};

  const title = `${corp.name} Portfolio | A House Divided`;
  const description = `${corp.name}'s investment holdings, bonds, and trading activity.`;
  const url = `${getSiteUrl()}/portfolio/corporation/${corpId}`;
  const image = corp.logoUrl || CDN_LOGO_URL;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "article",
      url,
      images: [{ url: image, width: 512, height: 512, alt: corp.name }],
    },
    twitter: { card: "summary", title, description, images: [image] },
  };
}

export default function PortfolioCorpLayout({ children }: LayoutProps) {
  return <>{children}</>;
}
