import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "A House Divided",
    short_name: "AHD",
    description: "Political simulation game — run for office, pass legislation, shape the nation.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#6366f1",
    orientation: "portrait-primary",
    icons: [
      // The install icon keeps the full 500px artwork. It lives in /public
      // rather than app/icon.png so the favicon route stays a 7 KB thumbnail
      // instead of shipping 177 KB of PNG on every page load.
      {
        src: "/icons/icon-500.png",
        sizes: "500x500",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-500.png",
        sizes: "500x500",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
