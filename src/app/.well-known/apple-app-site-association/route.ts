// Universal links for the AHDClient iPhone and iPad app. Game pages open in
// the app; sign-in, account and API paths always stay in the browser. Apple
// fetches this without following redirects, so it must be served directly.
const APP_ID = "QNQ5G88K5D.net.lakesidegames.ahdclient";

export const APPLE_APP_SITE_ASSOCIATION = {
  applinks: {
    details: [
      {
        appIDs: [APP_ID],
        components: [
          { "/": "/api/*", exclude: true },
          { "/": "/login*", exclude: true },
          { "/": "/auth*", exclude: true },
          { "/": "/register*", exclude: true },
          { "/": "/logout*", exclude: true },
          { "/": "/*" },
        ],
      },
    ],
  },
} as const;

export function GET(): Response {
  return new Response(JSON.stringify(APPLE_APP_SITE_ASSOCIATION), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
