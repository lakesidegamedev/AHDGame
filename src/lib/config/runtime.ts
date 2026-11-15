/** Deployment identity and feature switches set per environment. */

export const runtimeConfig = {
  nodeEnv: () => process.env.NODE_ENV,
  railwayEnvironmentName: () => process.env.RAILWAY_ENVIRONMENT_NAME,
  vercelEnv: () => process.env.VERCEL_ENV,
  singleplayer: () => process.env.SINGLEPLAYER === "1",
  singleplayerManagedMongo: () => process.env.SINGLEPLAYER_MANAGED_MONGO === "1",
  allowedOrigins: () => process.env.ALLOWED_ORIGINS,
  logRequests: () => process.env.LOG_REQUESTS === "1",
  publicViewingMode: () => process.env.PUBLIC_VIEWING_MODE,
  gameIteration: () => process.env.GAME_ITERATION,
  gameStartDate: () => process.env.GAME_START_DATE,

  retentionEnabled: () => process.env.RETENTION_ENABLED === "1",
  nativePushEnabled: () => process.env.NATIVE_PUSH_ENABLED === "true",
  auditMirrorSystemMoney: () => process.env.AUDIT_MIRROR_SYSTEM_MONEY === "1",
  blackjackHouseEdge: () => process.env.BLACKJACK_HOUSE_EDGE,

  ukConferencePayoff: () => process.env.UK_CONFERENCE_PAYOFF,
  ukConfidenceGaugeDissolution: () => process.env.UK_CONFIDENCE_GAUGE_DISSOLUTION === "1",
  ukManifestoVoteEffect: () => process.env.UK_MANIFESTO_VOTE_EFFECT === "1",
} as const;
