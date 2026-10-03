/**
 * Runtime configuration for the lobby browser.
 *
 * Values come from the environment with sensible proof-of-concept defaults.
 */
export class AppConfig {
  /** Steam App ID to inspect. 480 is Valve's public Spacewar test app. */
  public readonly appId: number;
  /** TCP port the Node server listens on. */
  public readonly port: number;
  /** Maximum number of lobbies requested from Steam in a single query. */
  public readonly maxLobbies: number;
  /** Optional Steam Web API key used to resolve host persona names. */
  public readonly steamWebApiKey: string | null;
  /** Set when the server should only serve the built client. */
  public readonly isProduction: boolean;

  /**
   * Builds the configuration from environment variables.
   */
  public constructor(env: NodeJS.ProcessEnv = process.env) {
    this.appId = AppConfig.readInt(env.STEAM_APP_ID, 480);
    this.port = AppConfig.readInt(env.PORT, 5173);
    this.maxLobbies = AppConfig.readInt(env.STEAM_MAX_LOBBIES, 50);
    const apiKey = env.STEAM_WEB_API_KEY?.trim();
    this.steamWebApiKey = apiKey && apiKey.length > 0 ? apiKey : null;
    this.isProduction = env.NODE_ENV === 'production';
  }

  /**
   * Reads a positive integer from the environment, falling back when absent or invalid.
   *
   * @param raw - The raw environment value, if present.
   * @param fallback - The value used when parsing fails.
   * @returns The parsed integer or the fallback.
   */
  private static readInt(raw: string | undefined, fallback: number): number {
    if (raw === undefined) {
      return fallback;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}