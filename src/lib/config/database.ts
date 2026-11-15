/** MongoDB connection. Required values are checked in validatedEnv. */

export const databaseConfig = {
  mongoUri: () => process.env.MONGODB_URI,
} as const;
