/** Session signing, sign-in providers and account gates. */

export const authConfig = {
  authSecret: () => process.env.AUTH_SECRET,
  adminRegistrationKey: () => process.env.ADMIN_REGISTRATION_KEY,
  testSecret: () => process.env.TEST_SECRET,
  turnstileSecretKey: () => process.env.TURNSTILE_SECRET_KEY,

  discordClientId: () => process.env.DISCORD_CLIENT_ID,
  discordClientSecret: () => process.env.DISCORD_CLIENT_SECRET,
  discordRedirectUri: () => process.env.DISCORD_REDIRECT_URI,

  googleClientId: () => process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
  googleRedirectUri: () => process.env.GOOGLE_REDIRECT_URI,

  appleClientId: () => process.env.APPLE_CLIENT_ID,
  appleTeamId: () => process.env.APPLE_TEAM_ID,
  appleKeyId: () => process.env.APPLE_KEY_ID,
  applePrivateKey: () => process.env.APPLE_PRIVATE_KEY,
  appleRedirectUri: () => process.env.APPLE_REDIRECT_URI,

  unifiedOidcEnabled: () => process.env.UNIFIED_OIDC_ENABLED === "true",
  unifiedOidcIssuer: () => process.env.UNIFIED_OIDC_ISSUER,
  unifiedOidcClientId: () => process.env.UNIFIED_OIDC_CLIENT_ID,
  unifiedOidcClientSecret: () => process.env.UNIFIED_OIDC_CLIENT_SECRET,
  unifiedOidcRedirectUri: () => process.env.UNIFIED_OIDC_REDIRECT_URI,

  unifiedCohortEnabled: () => process.env.AHD_UNIFIED_COHORT_ENABLED === "true",
  unifiedCohortTargets: () => process.env.AHD_UNIFIED_COHORT_TARGETS,
  unifiedGeneralCohort: () => process.env.AHD_UNIFIED_GENERAL_COHORT,
  migrationSourceIssuer: () => process.env.AHD_MIGRATION_SOURCE_ISSUER,
  migrationProofLoadSecret: () => process.env.AHD_MIGRATION_PROOF_LOAD_SECRET,

  centralLoginMode: () => process.env.AHD_CENTRAL_LOGIN_MODE,
  centralLoginTestUsers: () => process.env.AHD_CENTRAL_LOGIN_TEST_USERS,
  accountsUrl: () => process.env.LAKESIDE_ACCOUNTS_URL,
  accountBridgeUrl: () => process.env.LAKESIDE_ACCOUNT_BRIDGE_URL,
  accountBridgeTokenUrl: () => process.env.LAKESIDE_ACCOUNT_BRIDGE_TOKEN_URL,
  accountBridgeClientId: () => process.env.LAKESIDE_ACCOUNT_BRIDGE_CLIENT_ID,
  accountBridgeClientSecret: () => process.env.LAKESIDE_ACCOUNT_BRIDGE_CLIENT_SECRET,
  accountBridgeTimeoutMs: () => process.env.LAKESIDE_ACCOUNT_BRIDGE_TIMEOUT_MS,
  accountBridgeBreakerFailures: () => process.env.LAKESIDE_ACCOUNT_BRIDGE_BREAKER_FAILURES,
  accountBridgeBreakerOpenMs: () => process.env.LAKESIDE_ACCOUNT_BRIDGE_BREAKER_OPEN_MS,
} as const;
