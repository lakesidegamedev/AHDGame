import pkg from "../../../package.json";

/**
 * The live release, minted by `npm run changelog:release`.
 *
 * Kept in its own module so client code that only needs the version string does
 * not pull the marketing world (country client config and era tables) into its
 * bundle. `marketing/marketedWorld` re-exports it, so there is still one source.
 */
export const GAME_VERSION: string = pkg.version;
