/** Credentials and endpoints for services outside the game server. */

export const servicesConfig = {
  gitToken: () => process.env.GIT_TOKEN,
  githubRepo: () => process.env.GITHUB_REPO,

  sentryApiUrl: () => process.env.SENTRY_API_URL,
  sentryOrg: () => process.env.SENTRY_ORG,
  sentryApiToken: () => process.env.SENTRY_API_TOKEN,
  sentryEnvironment: () => process.env.SENTRY_ENVIRONMENT,

  r2AccountId: () => process.env.CLOUDFLARE_R2_ACCOUNT_ID,
  r2AccessKeyId: () => process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
  r2SecretAccessKey: () => process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  r2BucketName: () => process.env.CLOUDFLARE_R2_BUCKET_NAME,
  r2PublicUrl: () => process.env.CLOUDFLARE_R2_PUBLIC_URL,

  patreonCreatorToken: () => process.env.PATREON_CREATOR_TOKEN,
  patreonCampaignId: () => process.env.PATREON_CAMPAIGN_ID,

  resendApiKey: () => process.env.RESEND_API_KEY,
  emailFrom: () => process.env.EMAIL_FROM,
  smtpHost: () => process.env.SMTP_HOST?.trim() || undefined,
  smtpPort: () => {
    const port = Number(process.env.SMTP_PORT);
    return Number.isInteger(port) && port > 0 && port < 65536 ? port : 25;
  },

  fcmProjectId: () => process.env.FCM_PROJECT_ID,
  fcmClientEmail: () => process.env.FCM_CLIENT_EMAIL,
  fcmPrivateKey: () => process.env.FCM_PRIVATE_KEY,
  apnsTeamId: () => process.env.APNS_TEAM_ID,
  apnsKeyId: () => process.env.APNS_KEY_ID,
  apnsPrivateKey: () => process.env.APNS_PRIVATE_KEY,

  discordAlertWebhookUrl: () => process.env.DISCORD_ALERT_WEBHOOK_URL,
  wikiReportEndpoint: () => process.env.WIKI_REPORT_ENDPOINT,
  askDrawerUrl: () => process.env.ASK_DRAWER_URL,
  askDrawerSecret: () => process.env.ASK_DRAWER_SECRET,
  platformEventUrl: () => process.env.PLATFORM_EVENT_URL,
  platformEventToken: () => process.env.PLATFORM_EVENT_TOKEN,

  discordBotApiKey: () => process.env.DISCORD_BOT_API_KEY,
  publicBotApiKey: () => process.env.PUBLIC_BOT_API_KEY,
  internalApiKey: () => process.env.INTERNAL_API_KEY,
  askS2sToken: () => process.env.ASK_S2S_TOKEN,
  lakesideS2sToken: () => process.env.LAKESIDE_S2S_TOKEN,
  cronSecret: () => process.env.CRON_SECRET,
  seedSecret: () => process.env.SEED_SECRET,
  cfOriginSecret: () => process.env.CF_ORIGIN_SECRET,
} as const;
