import { usablePersonaName } from './PersonaName';

/**
 * Resolves Steam IDs to persona names.
 *
 * Steamworks exposes persona names for friends only, so two strategies are layered:
 *
 * 1. Local lookup through ISteamFriends, which covers anyone on the friend list.
 * 2. The Steam Web API `GetPlayerSummaries` endpoint, which covers any Steam ID but
 *    requires an API key. Without a key the resolver degrades to returning null and
 *    the client renders the raw Steam ID instead.
 *
 * Successful lookups are memoised for the process lifetime, since persona names are
 * stable enough for a lobby browser and Steam rate-limits the Web API aggressively.
 */
export class PersonaNameResolver {
  private readonly steamWebApiKey: string | null;
  private readonly cache: Map<string, string> = new Map();

  /**
   * Creates a resolver.
   *
   * @param steamWebApiKey - Steam Web API key, or null when name resolution is limited to friends.
   */
  public constructor(steamWebApiKey: string | null) {
    this.steamWebApiKey = steamWebApiKey;
  }

  /**
   * Reports whether arbitrary Steam IDs can be resolved.
   *
   * @returns True when a Web API key is configured.
   */
  public canResolveAnySteamId(): boolean {
    return this.steamWebApiKey !== null;
  }

  /**
   * Resolves a single Steam ID to a persona name.
   *
   * @param steamId - The Steam ID to resolve.
   * @param friends - ISteamFriends, used for the fast local path.
   * @returns The persona name, or null when it cannot be determined.
   */
  public resolve(steamId: string, friends: SteamFriendsLike | null): string | null {
    const cached = this.cache.get(steamId);
    if (cached !== undefined) {
      return cached;
    }

    const localName = this.resolveLocally(steamId, friends);
    if (localName !== null) {
      this.cache.set(steamId, localName);
      return localName;
    }

    return null;
  }

  /**
   * Resolves many Steam IDs in a single Web API round trip.
   *
   * Ids that cannot be resolved are simply omitted from the result so callers can
   * treat a miss as "show the raw id".
   *
   * @param steamIds - Steam IDs to resolve. Duplicates are collapsed.
   * @param friends - ISteamFriends, used for the fast local path.
   * @returns A map of Steam ID to persona name for those that resolved.
   */
  public async resolveMany(
    steamIds: readonly string[],
    friends: SteamFriendsLike | null,
  ): Promise<Map<string, string>> {
    const resolved = new Map<string, string>();
    const pending: string[] = [];

    for (const steamId of steamIds) {
      const cached = this.cache.get(steamId);
      if (cached !== undefined) {
        resolved.set(steamId, cached);
        continue;
      }

      const localName = this.resolveLocally(steamId, friends);
      if (localName !== null) {
        this.cache.set(steamId, localName);
        resolved.set(steamId, localName);
        continue;
      }

      pending.push(steamId);
    }

    if (pending.length === 0 || this.steamWebApiKey === null) {
      return resolved;
    }

    const remoteNames = await this.fetchPersonaNames(pending);
    for (const [steamId, name] of remoteNames) {
      this.cache.set(steamId, name);
      resolved.set(steamId, name);
    }

    return resolved;
  }

  /**
   * Attempts a local persona lookup for a Steam ID.
   *
   * @param steamId - The Steam ID to look up.
   * @param friends - ISteamFriends, used for the lookup.
   * @returns The persona name, or null when the user is not a friend or lookup failed.
   */
  private resolveLocally(steamId: string, friends: SteamFriendsLike | null): string | null {
    if (friends === null) {
      return null;
    }
    try {
      return usablePersonaName(friends.getFriendPersonaName(steamId));
    } catch {
      // Steam throws for anyone who is not on the friend list.
      return null;
    }
  }

  /**
   * Fetches persona names from the Steam Web API.
   *
   * @param steamIds - Steam IDs to look up, at most one hundred per call.
   * @returns A map of Steam ID to persona name for those the API returned.
   */
  private async fetchPersonaNames(steamIds: readonly string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    const key = this.steamWebApiKey;
    if (key === null) {
      return names;
    }

    // The endpoint accepts at most 100 ids per request.
    for (let offset = 0; offset < steamIds.length; offset += 100) {
      const batch = steamIds.slice(offset, offset + 100);
      const url = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/');
      url.searchParams.set('key', key);
      url.searchParams.set('steamids', batch.join(','));

      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
        if (!response.ok) {
          continue;
        }

        const payload = (await response.json()) as SteamPlayerSummariesResponse;
        for (const player of payload.response?.players ?? []) {
          const name = usablePersonaName(player.personaname);
          if (name !== null) {
            names.set(player.steamid, name);
          }
        }
      } catch {
        // Network trouble or a bad key. Partial results are still useful.
        break;
      }
    }

    return names;
  }
}

/**
 * The subset of ISteamFriends this resolver depends on.
 *
 * Declaring it locally keeps the service testable without the native SDK.
 */
export interface SteamFriendsLike {
  /**
   * Returns the persona name of a friend.
   *
   * @param steamId - Steam ID of the friend.
   * @returns The friend's persona name.
   */
  getFriendPersonaName(steamId: string): string;
}

/** Shape of the Steam `GetPlayerSummaries` response body. */
interface SteamPlayerSummariesResponse {
  /** Response wrapper containing the matched players. */
  response?: {
    /** Players matched by the request. */
    players?: Array<{
      /** The player's Steam ID. */
      steamid: string;
      /** The player's display name. */
      personaname: string;
    }>;
  };
}