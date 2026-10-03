import { usablePersonaName } from './PersonaName';

/** How a lobby's host was identified. */
export type LobbyHostSource =
  /** The Steamworks API returned the owner directly. */
  | 'api'
  /** The owner was recovered from the lobby's advertised metadata. */
  | 'metadata'
  /** No host information could be recovered. */
  | 'unresolved';

/** The identity of a lobby's host. */
export interface LobbyHostIdentity {
  /** Steam ID of the host, or null when it could not be determined. */
  readonly steamId: string | null;
  /** Display name of the host, or null when it could not be determined. */
  readonly name: string | null;
  /** Which strategy produced this identity. */
  readonly source: LobbyHostSource;
}

/**
 * Metadata keys that have been observed to hold the lobby host's Steam ID.
 *
 * `ISteamMatchmaking::GetLobbyOwner` only works for lobbies the caller is a member
 * of. A lobby discovered through `RequestLobbyList` is not a lobby you have joined,
 * so the API returns zero and there is no member roster either. The host therefore
 * has to be recovered from the metadata the host itself advertised.
 *
 * Keys are tried in descending order of how reliably they denote the host.
 * Notably absent is `2A`, which SteamNetworkingSockets documents as a client port
 * but some games use for a Steam ID; trusting it would misattribute the host.
 */
const HOST_ID_KEYS: readonly string[] = [
  'OWNINGID',
  'P2PADDR',
  'OI',
  'ownerSteamId_s',
  'ownerSteamID',
  'hoststeamid',
  'HOST',
  '__gameserverSteamID',
  'SteamID_s',
  'ct_host_id',
  'idas3.owner',
  'PlayerSteamId_s',
];

/**
 * Metadata keys that have been observed to hold the lobby host's display name.
 *
 * Worth preferring over any network lookup: it is free, instant, and works for
 * lobbies whose host is not on the local friend list.
 */
const HOST_NAME_KEYS: readonly string[] = [
  'OWNINGNAME',
  'OWNINGNAME_s',
  'HOSTNAME',
  'HostName_s',
  'hostname_s',
];

/** Lowest Steam ID64 for an individual account. Anything below is not a user. */
const FIRST_INDIVIDUAL_STEAM_ID64 = 76_561_197_960_265_728;

/**
 * Identifies who is hosting a lobby.
 *
 * Steam's lobby API exposes no host field for lobbies you have merely discovered,
 * so this works from the metadata the host chose to advertise and falls back to a
 * network lookup only when the host gave a Steam ID but no name.
 */
export class LobbyHostResolver {
  /**
   * Creates the resolver.
   *
   * @param getOwnerFromApi - Reads the owner via ISteamMatchmaking.
   * @param resolveName - Resolves a Steam ID to a display name.
   */
  public constructor(
    private readonly getOwnerFromApi: (lobbyId: string) => string,
    private readonly resolveName: (steamIds: readonly string[]) => Promise<Map<string, string>>,
  ) {}

  /**
   * Determines who is hosting a lobby.
   *
   * @param lobbyId - The lobby to identify the host of.
   * @param data - The lobby's advertised metadata.
   * @returns The host identity, with nulls where nothing could be recovered.
   */
  public async resolve(lobbyId: string, data: Record<string, string>): Promise<LobbyHostIdentity> {
    const apiOwner = this.normaliseSteamId(this.getOwnerFromApi(lobbyId));
    const metadataOwner = LobbyHostResolver.firstValidSteamId(data, HOST_ID_KEYS);
    const advertisedName = LobbyHostResolver.firstValue(data, HOST_NAME_KEYS);

    if (apiOwner !== null) {
      const name = await this.lookupName(apiOwner, data);
      return { steamId: apiOwner, name, source: 'api' };
    }

    if (metadataOwner !== null) {
      const name = await this.lookupName(metadataOwner, data, advertisedName);
      return { steamId: metadataOwner, name, source: 'metadata' };
    }

    // No Steam ID anywhere, but the host may still have advertised a name.
    return { steamId: null, name: advertisedName, source: 'unresolved' };
  }

  /**
   * Resolves the display name for a host.
   *
   * @param steamId - The host's Steam ID.
   * @param data - The lobby's advertised metadata.
   * @param advertisedName - A name read from metadata, if one was present.
   * @returns The display name, or null when it could not be determined.
   */
  private async lookupName(
    steamId: string,
    data: Record<string, string>,
    advertisedName: string | null = null,
  ): Promise<string | null> {
    // Metadata is authoritative: the host published it alongside its Steam ID.
    const fromMetadata = advertisedName ?? LobbyHostResolver.firstValue(data, HOST_NAME_KEYS);
    if (fromMetadata !== null) {
      return fromMetadata;
    }

    // The lookup is filtered rather than trusted: Steam substitutes `[unknown]` for
    // private profiles, and this is the last point before the name reaches the UI.
    const resolved = await this.resolveName([steamId]);
    return usablePersonaName(resolved.get(steamId) ?? null);
  }

  /**
   * Trims a value returned by the API and rejects the empty string.
   *
   * `GetLobbyOwner` yields an empty string rather than zero for lobbies the caller
   * is not a member of, so emptiness must be handled explicitly.
   *
   * @param raw - The raw value from the API.
   * @returns The trimmed Steam ID, or null when there is none.
   */
  private normaliseSteamId(raw: string): string | null {
    const trimmed = raw?.trim() ?? '';
    return LobbyHostResolver.isSteamId64(trimmed) ? trimmed : null;
  }

  /**
   * Finds the first metadata key holding a valid Steam ID.
   *
   * @param data - The lobby's advertised metadata.
   * @param keys - Candidate keys, in priority order.
   * @returns The Steam ID, or null when none of the keys hold one.
   */
  private static firstValidSteamId(
    data: Record<string, string>,
    keys: readonly string[],
  ): string | null {
    for (const key of keys) {
      const value = data[key]?.trim() ?? '';
      if (LobbyHostResolver.isSteamId64(value)) {
        return value;
      }
    }
    return null;
  }

  /**
   * Finds the first metadata key holding a non-empty value.
   *
   * @param data - The lobby's advertised metadata.
   * @param keys - Candidate keys, in priority order.
   * @returns The trimmed value, or null when none of the keys hold one.
   */
  private static firstValue(
    data: Record<string, string>,
    keys: readonly string[],
  ): string | null {
    for (const key of keys) {
      // A host can advertise `[unknown]` in place of a name, so the value is
      // validated rather than trusted for being non-empty.
      const name = usablePersonaName(data[key]);
      if (name !== null) {
        return name;
      }
    }
    return null;
  }

  /**
   * Reports whether a value is a plausible individual-account Steam ID64.
   *
   * @param value - The candidate value.
   * @returns True when the value could be a Steam ID64.
   */
  private static isSteamId64(value: string): boolean {
    if (!/^\d{17}$/.test(value)) {
      return false;
    }
    return Number(value) >= FIRST_INDIVIDUAL_STEAM_ID64;
  }
}