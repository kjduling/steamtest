import type {
  LobbyListError,
  LobbyListResponse,
  SteamConnectionInfo,
} from '../../shared/lobby';
import { LobbyViewModel } from '../models/LobbyViewModel';

/**
 * Result of a lobby query, including Steam's connection state.
 */
export interface LobbyQueryResult {
  /** Lobbies discovered, empty when the query failed. */
  readonly lobbies: readonly LobbyViewModel[];
  /** Description of the local Steam connection. */
  readonly steam: SteamConnectionInfo;
  /** Failure message, or null when the query succeeded. */
  readonly error: string | null;
}

/**
 * Talks to the server's lobby endpoints.
 *
 * Owns all network concerns, including turning non-2xx responses into a result
 * object rather than an exception, so callers handle failure and success uniformly.
 */
export class LobbyApiClient {
  private readonly baseUrl: string;

  /**
   * Creates the client.
   *
   * @param baseUrl - Base URL of the API, without a trailing slash.
   */
  public constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  /**
   * Fetches the current lobby list.
   *
   * @returns The lobbies plus the Steam connection state, never throws.
   */
  public async fetchLobbies(): Promise<LobbyQueryResult> {
    try {
      const response = await fetch(`${this.baseUrl}/lobbies`, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        const payload = (await response.json()) as LobbyListError;
        return {
          lobbies: [],
          steam: payload.steam,
          error: payload.error,
        };
      }

      const payload = (await response.json()) as LobbyListResponse;
      return {
        lobbies: payload.lobbies.map((session) => new LobbyViewModel(session)),
        steam: payload.steam,
        error: null,
      };
    } catch (error) {
      return {
        lobbies: [],
        steam: LobbyApiClient.unreachableSteam(),
        error:
          error instanceof Error
            ? `Could not reach the server: ${error.message}`
            : 'Could not reach the server.',
      };
    }
  }

  /**
   * Builds a connection state for the case where the server itself is unreachable.
   *
   * @returns A disconnected state carrying no Steam details.
   */
  private static unreachableSteam(): SteamConnectionInfo {
    return {
      connected: false,
      appId: 480,
      appName: 'Spacewar',
      steamId: null,
      personaName: null,
      detail: 'The Node server is not responding.',
    };
  }
}