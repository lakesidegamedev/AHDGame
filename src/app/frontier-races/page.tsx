import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/siteMetadata";
import { FrontierRacesClient } from "./FrontierRacesClient";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return publicPageMetadata({
    title: "Frontier programme races | A House Divided",
    description:
      "Nations and corporations race to finish the fusion, orbital and biotech programmes of the 2040s. First to the threshold takes the method; the rest are licensed later.",
    pathname: "/frontier-races",
  });
}

export default function FrontierRacesPage() {
  return <FrontierRacesClient />;
}
