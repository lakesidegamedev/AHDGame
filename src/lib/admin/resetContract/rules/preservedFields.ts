/**
 * Field-level reset contract for preserved collections.
 *
 * A preserved collection survives a world reset, so anything the old world
 * wrote onto its documents survives too unless the reset says otherwise. Each
 * preserved collection is classified here as a whole, and the ones that carry
 * game state on a surviving document classify every field: keep it, clear it,
 * or reset it to a fresh-world value. `preservedFields.test.ts` reads the
 * document types and fails on any field missing from its contract.
 */

/**
 * `activityLog` rows about the ACCOUNT, which survive a reset: login and logout
 * rows carry the signals alt detection and the moderation dossier read, and
 * `character_deleted` marks a hard delete. Every other type is world state read
 * by turn number or recent-activity windows, so it is removed.
 */
export const PRESERVED_ACTIVITY_LOG_TYPES: readonly string[] = Object.freeze([
  "login",
  "logout",
  "character_deleted",
]);

export type PreservedFieldRule =
  | { action: "keep"; reason: string }
  | { action: "clear"; reason: string }
  | { action: "reset"; value: unknown; reason: string }
  /** Reset from another field of the same document (an update-pipeline expression). */
  | { action: "derive"; expression: Record<string, unknown>; reason: string };

export type PreservedFieldContract = Readonly<Record<string, PreservedFieldRule>>;

export type PreservedCollectionRule =
  /** Documents hold no world state; every field survives. */
  | { kind: "keep-whole"; reason: string }
  /** Every document is removed or archived by the reset before the new world is built. */
  | { kind: "emptied"; reason: string }
  /** Documents survive; their fields follow a field contract. */
  | { kind: "fields"; typeName: string; typeFile: string; fields: PreservedFieldContract };

const keep = (reason: string): PreservedFieldRule => ({ action: "keep", reason });
const clear = (reason: string): PreservedFieldRule => ({ action: "clear", reason });
const reset = (value: unknown, reason: string): PreservedFieldRule => ({
  action: "reset",
  value,
  reason,
});

const ACCOUNT = "Account identity or credentials, independent of any world.";
const AUTH = "Authentication and account security state.";
const SIGNAL = "Identity signal used by alt detection and moderation across worlds.";
const LINKED = "Linked sign-in provider identity.";
const PREFERENCE = "Account presentation preference.";
const SUPPORTER = "Supporter entitlement, billed outside the game world.";
const ACCESS = "Access grant for a client or test environment.";
const MODERATION = "Moderation record that must outlive the world it was written in.";
const REFERRAL = "Referral credit, awarded by account and contest rather than by world.";

export const USER_FIELD_CONTRACT: PreservedFieldContract = Object.freeze({
  _id: keep(ACCOUNT),
  email: keep(ACCOUNT),
  emailVerifiedAt: keep(ACCOUNT),
  emailHistory: keep(ACCOUNT),
  username: keep(ACCOUNT),
  usernameHistory: keep(ACCOUNT),
  displayName: keep(ACCOUNT),
  password: keep(AUTH),
  role: keep("Staff role."),
  isAdmin: keep("Staff role."),
  isBanned: keep(MODERATION),
  banReason: keep(MODERATION),
  bannedAt: keep(MODERATION),
  authRevokedAt: keep(AUTH),
  authMigrationFence: keep(AUTH),
  accountDeletion: keep("Account deletion command; its lifecycle is not tied to a world."),
  passwordChangedAt: keep(AUTH),
  passwordSupersededAt: keep(AUTH),
  bannedShareReleaseProcessedAt: keep(MODERATION),
  bannedShareReleaseCorporationIds: clear(
    "Corporations captured at ban time belong to the old world and are deleted by the reset."
  ),
  hasCompletedSetup: reset(false, "No character exists in the new world yet."),
  activeCharacterId: clear("Every character is retired or deleted by the reset."),
  activeImperialCharacterId: clear("Imperial sessions are chosen again in the new world."),
  activeCharacterType: clear("Pairs with the active character pointers cleared above."),
  activeCharacterCount: reset(0, "Every character is retired or deleted by the reset."),
  lastCorporationFoundedTurn: clear(
    "Refounding cooldown measured in old-world turns; the turn counter restarts."
  ),
  createdAt: keep(ACCOUNT),
  updatedAt: keep(ACCOUNT),
  lastLogin: keep(SIGNAL),
  lastLogout: keep(SIGNAL),
  lastActivity: keep(SIGNAL),
  lastSeenAt: keep(SIGNAL),
  registrationIp: keep(SIGNAL),
  lastKnownIp: keep(SIGNAL),
  lastAuthToken: keep(AUTH),
  registrationFingerprint: keep(SIGNAL),
  lastFingerprint: keep(SIGNAL),
  fingerprintHistory: keep(SIGNAL),
  registrationFingerprintComponents: keep(SIGNAL),
  lastFingerprintComponents: keep(SIGNAL),
  trackingId: keep(SIGNAL),
  deviceKey: keep(SIGNAL),
  trackingIdAt: keep(SIGNAL),
  deviceKeyAt: keep(SIGNAL),
  lastFingerprintAt: keep(SIGNAL),
  lastKnownIpAt: keep(SIGNAL),
  registrationFingerprintAt: keep(SIGNAL),
  lastDevice: keep(SIGNAL),
  ipDetails: keep(SIGNAL),
  registrationCf: keep(SIGNAL),
  lastCf: keep(SIGNAL),
  acquisition: keep("Signup source analytics."),
  supportRecentVisits: keep("Support context for open tickets."),
  accountCountryId: keep("Account nationality is immutable by design."),
  legacyDisplayCharacterId: keep("Hall of Fame choice spans every iteration."),
  blockedUserIds: keep("Player safety setting between accounts."),
  discordId: keep(LINKED),
  discordUsername: keep(LINKED),
  discordAvatar: keep(LINKED),
  discordLinkedAt: keep(LINKED),
  googleId: keep(LINKED),
  googleEmail: keep(LINKED),
  googleName: keep(LINKED),
  googleAvatar: keep(LINKED),
  googleLinkedAt: keep(LINKED),
  appleId: keep(LINKED),
  appleEmail: keep(LINKED),
  appleLinkedAt: keep(LINKED),
  appleRefreshToken: keep(LINKED),
  theme: keep(PREFERENCE),
  statusBarLayout: keep(PREFERENCE),
  disableAutoplayOnOtherProfiles: keep(PREFERENCE),
  enableExperimentalUI: keep(PREFERENCE),
  experimentalFeatures: keep(PREFERENCE),
  desktopNavigationLayout: keep(PREFERENCE),
  mobileNavigationLayout: keep(PREFERENCE),
  widgetLayout: keep(PREFERENCE),
  widgetTrayOpen: keep(PREFERENCE),
  widgetWatchlist: clear("Starred corporations belong to the old world and are deleted."),
  keirPet: keep(PREFERENCE),
  askDrawerSide: keep(PREFERENCE),
  askDrawerHidden: keep(PREFERENCE),
  navCustomization: keep(PREFERENCE),
  actionsViewMode: keep(PREFERENCE),
  corpOverviewMode: keep(PREFERENCE),
  notificationPreferences: keep(PREFERENCE),
  referredBy: keep(REFERRAL),
  referralCount: keep(REFERRAL),
  referralContestCount: keep(REFERRAL),
  patreonTier: keep(SUPPORTER),
  supporterProvider: keep(SUPPORTER),
  patreonExpiresAt: keep(SUPPORTER),
  patreonSince: keep(SUPPORTER),
  patreonUserId: keep(SUPPORTER),
  adsDisabled: keep(SUPPORTER),
  patreonAdPreference: keep(SUPPORTER),
  patreonHighlightColor: keep(SUPPORTER),
  patreonProfileBorder: keep(SUPPORTER),
  supporterWallName: keep(SUPPORTER),
  nppRenameUsedAt: keep("One-time supporter perk per account."),
  singleplayerEntitledAt: keep(ACCESS),
  singleplayerEntitledBy: keep(ACCESS),
  clientAccessExpiresAt: keep(ACCESS),
  clientAccessSource: keep(ACCESS),
  clientAccessGrantedBy: keep(ACCESS),
  sandboxAccessGrantedAt: keep(ACCESS),
  sandboxAccessGrantedBy: keep(ACCESS),
  vpnWhitelisted: keep(MODERATION),
  vpnWhitelistedAt: keep(MODERATION),
  vpnWhitelistedBy: keep(MODERATION),
  modNote: keep(MODERATION),
  modNotes: keep(MODERATION),
  notificationBundleUserIds: keep("Staff-configured inbox bundle between accounts."),
  moderatorSince: keep("Staff role."),
  juniorDevSince: keep("Staff role."),
  lastRetiredAt: keep("Wall-clock anti-abuse cooldown, not a game-turn value."),
  wireQuotaUsed: clear("Counts transfers made with old-world money."),
  wireQuotaWindowStart: clear("Pairs with wireQuotaUsed."),
});

const IMPERIAL_IDENTITY = "Imperial identity survives so the head of state keeps its profile.";
const IMPERIAL_PROFILE = "Profile cosmetics chosen by the account.";

export const IMPERIAL_CHARACTER_FIELD_CONTRACT: PreservedFieldContract = Object.freeze({
  _id: keep(IMPERIAL_IDENTITY),
  userId: keep(IMPERIAL_IDENTITY),
  countryId: keep(IMPERIAL_IDENTITY),
  name: keep(IMPERIAL_IDENTITY),
  gender: keep(IMPERIAL_IDENTITY),
  homeState: keep(IMPERIAL_IDENTITY),
  sequentialId: keep("Profile URL; the imperial counter is restored from it after reset."),
  royalHouse: keep(IMPERIAL_IDENTITY),
  coatOfArmsUrl: keep(IMPERIAL_PROFILE),
  avatarUrl: keep(IMPERIAL_PROFILE),
  profileHeaderImageUrl: keep(IMPERIAL_PROFILE),
  borderKey: keep(IMPERIAL_PROFILE),
  tintColor: keep(IMPERIAL_PROFILE),
  bio: keep(IMPERIAL_PROFILE),
  campaignSongUrl: keep(IMPERIAL_PROFILE),
  campaignSongAutoplay: keep(IMPERIAL_PROFILE),
  autoConvertEnabled: keep("Wallet preference, not a balance."),
  displayCurrencyPreference: keep("Wallet preference, not a balance."),
  initialIncomeTier: keep("Authored starting tier the reset restores incomeTier from."),
  cashOnHand: reset(0, "A new world starts every personal wallet empty."),
  currencyBalances: reset({ personal: {} }, "A new world starts every personal wallet empty."),
  incomeTier: {
    action: "derive",
    expression: { $ifNull: ["$initialIncomeTier", "high"] },
    reason: "Income tier earned in the old world returns to the authored start.",
  },
  incomeTaxStartTurn: reset(1, "Income tax accrual restarts with the turn counter."),
  incomeTaxBatchReceipt: reset(null, "Tax receipts belong to old-world turns."),
  pendingStockTaxReceipts: reset([], "Tax receipts belong to old-world turns."),
  createdAt: keep(IMPERIAL_IDENTITY),
  updatedAt: keep(IMPERIAL_IDENTITY),
});

const KEEP_ACCOUNT = "Account, authentication or device state; no world state.";
const KEEP_MODERATION = "Moderation or audit evidence that must outlive the world.";
const KEEP_COMMUNITY = "Community or support content written by players and staff.";
const KEEP_OPS = "Operational, deploy or remediation record; no world state.";
const KEEP_ADMIN_CONFIG = "Admin-authored configuration read by the seed pipeline.";
const KEEP_HISTORY = "Archive of finished worlds, read back as earlier iterations.";

/**
 * Lifecycle of every preserved collection in the seed manifest. The contract
 * test fails when the manifest gains a preserved collection with no entry here.
 */
export const PRESERVED_COLLECTION_CONTRACT: Readonly<Record<string, PreservedCollectionRule>> =
  Object.freeze({
    users: {
      kind: "fields",
      typeName: "User",
      typeFile: "src/lib/db/types/user.ts",
      fields: USER_FIELD_CONTRACT,
    },
    imperialCharacters: {
      kind: "fields",
      typeName: "ImperialCharacter",
      typeFile: "src/lib/db/types/imperialCharacter.ts",
      fields: IMPERIAL_CHARACTER_FIELD_CONTRACT,
    },
    characters: {
      kind: "emptied",
      reason:
        "A soft reset retires every character into retiredCharacters; a full reset deletes them.",
    },
    retiredCharacters: { kind: "keep-whole", reason: KEEP_HISTORY },
    characterAchievements: { kind: "keep-whole", reason: "Account achievements span every world." },
    officeHistoryArchive: { kind: "keep-whole", reason: KEEP_HISTORY },
    manualOfficeHistory: { kind: "keep-whole", reason: KEEP_HISTORY },
    politicianOverrides: { kind: "keep-whole", reason: KEEP_HISTORY },
    unifiedSessions: { kind: "keep-whole", reason: KEEP_ACCOUNT },
    unifiedOidcFlows: { kind: "keep-whole", reason: KEEP_ACCOUNT },
    nativePushDevices: { kind: "keep-whole", reason: KEEP_ACCOUNT },
    authSourceOwnershipProofs: { kind: "keep-whole", reason: KEEP_ACCOUNT },
    centralLoginShadowEvents: { kind: "keep-whole", reason: KEEP_ACCOUNT },
    lakesideHopFlows: { kind: "keep-whole", reason: KEEP_ACCOUNT },
    emailChanges: { kind: "keep-whole", reason: KEEP_ACCOUNT },
    passwordResets: { kind: "keep-whole", reason: KEEP_ACCOUNT },
    sourceFenceConsumptions: { kind: "keep-whole", reason: KEEP_ACCOUNT },
    sourceFenceReceipts: { kind: "keep-whole", reason: KEEP_ACCOUNT },
    botApiKeys: { kind: "keep-whole", reason: KEEP_ACCOUNT },
    userApiKeys: { kind: "keep-whole", reason: KEEP_ACCOUNT },
    userSubscriptions: { kind: "keep-whole", reason: "Supporter billing records." },
    promoGrants: {
      kind: "keep-whole",
      reason: "Once-per-player grants; kept so a reset cannot pay a campaign twice.",
    },
    discordBotFunds: {
      kind: "keep-whole",
      reason: "Community bot house funds, held outside any game treasury.",
    },
    patreonReconcileUnmatched: { kind: "keep-whole", reason: "Supporter reconciliation audit." },
    patreonReconcileRuns: { kind: "keep-whole", reason: "Supporter reconciliation audit." },
    supporterRequests: { kind: "keep-whole", reason: KEEP_COMMUNITY },
    contestRounds: {
      kind: "keep-whole",
      reason: "The iteration referral contest is awarded across the reset that ends it.",
    },
    adminLogs: { kind: "keep-whole", reason: "Audit trail, including the reset run record." },
    modAuditLog: { kind: "keep-whole", reason: KEEP_MODERATION },
    bannedIps: { kind: "keep-whole", reason: KEEP_MODERATION },
    bannedDevices: { kind: "keep-whole", reason: KEEP_MODERATION },
    partyMembershipEvents: { kind: "keep-whole", reason: KEEP_MODERATION },
    suspiciousCharacters: { kind: "keep-whole", reason: KEEP_MODERATION },
    altLinks: { kind: "keep-whole", reason: KEEP_MODERATION },
    altClusters: { kind: "keep-whole", reason: KEEP_MODERATION },
    altDigestState: { kind: "keep-whole", reason: KEEP_MODERATION },
    identityObservations: { kind: "keep-whole", reason: KEEP_MODERATION },
    altScoringRuns: { kind: "keep-whole", reason: KEEP_MODERATION },
    actionAuditLog: { kind: "keep-whole", reason: KEEP_MODERATION },
    auditAnomalies: { kind: "keep-whole", reason: KEEP_MODERATION },
    watchlist: { kind: "keep-whole", reason: KEEP_MODERATION },
    playerMailReports: { kind: "keep-whole", reason: KEEP_MODERATION },
    playerContentReports: { kind: "keep-whole", reason: KEEP_MODERATION },
    apiAccessLog: { kind: "keep-whole", reason: KEEP_MODERATION },
    apiAbuseScans: { kind: "keep-whole", reason: KEEP_MODERATION },
    botApiRequestLog: { kind: "keep-whole", reason: KEEP_MODERATION },
    broadcastDms: { kind: "keep-whole", reason: KEEP_MODERATION },
    feedback: { kind: "keep-whole", reason: KEEP_COMMUNITY },
    tickets: { kind: "keep-whole", reason: KEEP_COMMUNITY },
    comments: { kind: "keep-whole", reason: KEEP_COMMUNITY },
    suggestions: { kind: "keep-whole", reason: KEEP_COMMUNITY },
    suggestionComments: { kind: "keep-whole", reason: KEEP_COMMUNITY },
    suggestionReactions: { kind: "keep-whole", reason: KEEP_COMMUNITY },
    suggestionReads: { kind: "keep-whole", reason: KEEP_COMMUNITY },
    wikiReports: { kind: "keep-whole", reason: KEEP_COMMUNITY },
    wikiPages: { kind: "keep-whole", reason: KEEP_COMMUNITY },
    wikiTemplates: { kind: "keep-whole", reason: KEEP_COMMUNITY },
    playerBannerAds: { kind: "keep-whole", reason: KEEP_COMMUNITY },
    roadmapCategories: { kind: "keep-whole", reason: KEEP_COMMUNITY },
    roadmapItems: { kind: "keep-whole", reason: KEEP_COMMUNITY },
    changelogSentHistory: { kind: "keep-whole", reason: KEEP_COMMUNITY },
    systemSettings: { kind: "keep-whole", reason: KEEP_OPS },
    systemTags: { kind: "keep-whole", reason: KEEP_OPS },
    tasks: { kind: "keep-whole", reason: KEEP_OPS },
    taskComments: { kind: "keep-whole", reason: KEEP_OPS },
    taskLessons: { kind: "keep-whole", reason: KEEP_OPS },
    migrations: { kind: "keep-whole", reason: KEEP_OPS },
    migrationsRun: { kind: "keep-whole", reason: KEEP_OPS },
    remediations: { kind: "keep-whole", reason: KEEP_OPS },
    healBackups: { kind: "keep-whole", reason: KEEP_OPS },
    healRuns: { kind: "keep-whole", reason: KEEP_OPS },
    healTokens: { kind: "keep-whole", reason: KEEP_OPS },
    economyResetPlans: { kind: "keep-whole", reason: KEEP_OPS },
    rateLimitBuckets: { kind: "keep-whole", reason: KEEP_OPS },
    cronLocks: { kind: "keep-whole", reason: KEEP_OPS },
    ipGeoCache: { kind: "keep-whole", reason: KEEP_OPS },
    vpnIpLists: { kind: "keep-whole", reason: KEEP_OPS },
    diagnostics: { kind: "keep-whole", reason: KEEP_OPS },
    clientDiagnostics: { kind: "keep-whole", reason: KEEP_OPS },
    clientSimulationStatistics: { kind: "keep-whole", reason: KEEP_OPS },
    siteTrafficPageviews: { kind: "keep-whole", reason: KEEP_OPS },
    codeQualitySnapshots: { kind: "keep-whole", reason: KEEP_OPS },
    simRuns: { kind: "keep-whole", reason: KEEP_OPS },
    demographicConfigOverrides: { kind: "keep-whole", reason: KEEP_ADMIN_CONFIG },
    electoratePriorityOverrides: { kind: "keep-whole", reason: KEEP_ADMIN_CONFIG },
    eventDefinitions: { kind: "keep-whole", reason: KEEP_ADMIN_CONFIG },
  });

export interface PreservedFieldResetUpdate {
  /** Literal fresh-world values. */
  set: Record<string, unknown>;
  /** Values computed from the same document. */
  derive: Record<string, Record<string, unknown>>;
  /** Fields removed outright. */
  unset: string[];
}

/** The update a reset applies to every document of a field-contracted collection. */
export function preservedFieldResetUpdate(
  contract: PreservedFieldContract
): PreservedFieldResetUpdate {
  const update: PreservedFieldResetUpdate = { set: {}, derive: {}, unset: [] };
  for (const [field, rule] of Object.entries(contract)) {
    if (rule.action === "clear") update.unset.push(field);
    else if (rule.action === "derive") update.derive[field] = rule.expression;
    else if (rule.action === "reset") {
      if (typeof rule.value === "string" && rule.value.startsWith("$")) {
        throw new Error(`Reset value for ${field} would be read as a field path`);
      }
      update.set[field] = rule.value;
    }
  }
  return update;
}

/**
 * Fields on a surviving document that still hold old-world state after the
 * reset applied its contract. Plain data in: the shell projects the fields.
 */
export function preservedFieldResidue(
  contract: PreservedFieldContract,
  document: Readonly<Record<string, unknown>>
): string[] {
  const residue: string[] = [];
  for (const [field, rule] of Object.entries(contract)) {
    const value = document[field];
    if (rule.action === "clear" && value !== undefined && value !== null) residue.push(field);
    if (rule.action === "reset" && value !== undefined && !sameValue(value, rule.value)) {
      residue.push(field);
    }
  }
  return residue;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
