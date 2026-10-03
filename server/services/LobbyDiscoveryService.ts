import { ELobbyDistanceFilter } from 'steamworks-ffi-node';

import { Lobby, type RawLobbyRecord } from '../models/Lobby';
import { AppNameCatalogue } from './AppNameCatalogue';
import { LobbyHostResolver, type LobbyHostIdentity } from './LobbyHostResolver';
import { PersonaNameResolver } from './PersonaNameResolver';
import type { SteamGateway, SteamMatchmakingGateway } from './SteamGateway';

/**
 * Raised when the lobby list cannot be retrieved.
 *
 * Carries a message suitable for showing to a user, rather than a stack trace.
 */
export class LobbyDiscoveryError extends Error {
  /**
   * Creates the error.
   *
   * @param message - A user-facing description of the failure.
   */
  public constructor(message: string) {
    super(message);
    this.name = 'LobbyDiscoveryError';
  }
}

/**
 * Queries Steam for the lobbies advertising the target application.
 *
 * Steam only returns lobbies for the App ID the process is initialised with, so the
 * configured App ID is the filter. Each result is then hydrated with its full
 * parameter set, host identity, and membership counts.
 */
export class LobbyDiscoveryService {
  /** Time allowed for asynchronous lobby metadata replies to arrive. */
  private static readonly LOBBY_DATA_SETTLE_MS = 250;

  private readonly runtime: SteamGateway;
  private readonly appNames: AppNameCatalogue;
  private readonly personas: PersonaNameResolver;
  private readonly appId: number;
  private readonly maxLobbies: number;

  /**
   * Creates the discovery service.
   *
   * @param runtime - The Steam gateway to query.
   * @param appNames - Catalogue used to resolve App ID to application name.
   * @param personas - Resolver used to resolve host Steam IDs to names.
   * @param appId - App ID whose lobbies should be listed.
   * @param maxLobbies - Upper bound on lobbies requested from Steam.
   */
  public constructor(
    runtime: SteamGateway,
    appNames: AppNameCatalogue,
    personas: PersonaNameResolver,
    appId: number,
    maxLobbies: number,
  ) {
    this.runtime = runtime;
    this.appNames = appNames;
    this.personas = personas;
    this.appId = appId;
    this.maxLobbies = maxLobbies;
  }

  /**
   * Lists every lobby currently advertised for the configured App ID.
   *
   * @returns The discovered lobbies.
   * @throws {LobbyDiscoveryError} When Steam is unavailable or the query fails.
   */
  public async listLobbies(): Promise<Lobby[]> {
    const matchmaking = this.runtime.getMatchmaking();
    if (matchmaking === null) {
      throw new LobbyDiscoveryError(
        this.runtime.getFailureReason() ?? 'Steam is not available.',
      );
    }

    // Filters are consumed by the next list request, so they must be set here.
    matchmaking.addRequestLobbyListDistanceFilter(ELobbyDistanceFilter.Default);
    matchmaking.addRequestLobbyListResultCountFilter(this.maxLobbies);

    const result = await matchmaking.requestLobbyList();
    if (!result.success) {
      throw new LobbyDiscoveryError(
        'Steam did not return a lobby list. The client may be signed out or still connecting.',
      );
    }

    const appName = this.appNames.resolve(this.appId);
    const records = await this.hydrateLobbies(result.lobbies, matchmaking);
    const hosts = await this.identifyHosts(records, matchmaking);

    return records.map((record) => {
      const host = hosts.get(record.lobbyId);
      return new Lobby(
        {
          lobbyId: record.lobbyId,
          memberCount: record.memberCount,
          maxMembers: record.maxMembers,
          parameters: record.parameters,
          hostSteamId: host?.steamId ?? null,
          hostName: host?.name ?? null,
          hostSource: host?.source ?? 'unresolved',
        },
        this.appId,
        appName,
      );
    });
  }

  /**
   * Resolves the host of every discovered lobby.
   *
   * @param records - The hydrated lobby records.
   * @param matchmaking - The ISteamMatchmaking interface.
   * @returns A map of lobby ID to host identity.
   */
  private async identifyHosts(
    records: readonly RawLobbyRecord[],
    matchmaking: SteamMatchmakingGateway,
  ): Promise<Map<string, LobbyHostIdentity>> {
    const friends = this.runtime.getFriends();
    const resolver = new LobbyHostResolver(
      (lobbyId) => matchmaking.getLobbyOwner(lobbyId),
      async (steamIds) => this.personas.resolveMany(steamIds, friends),
    );

    const identities = new Map<string, LobbyHostIdentity>();
    for (const record of records) {
      identities.set(
        record.lobbyId,
        await resolver.resolve(record.lobbyId, record.parameters),
      );
    }
    return identities;
  }

  /**
   * Converts raw lobby IDs into fully populated records.
   *
   * Metadata is requested for every lobby first, then callbacks are pumped so the
   * replies land before the detail reads. A lobby that cannot be read is skipped
   * rather than failing the whole listing, since lobbies routinely disappear between
   * the list request and the detail read.
   *
   * @param lobbyIds - Lobby IDs returned by Steam.
   * @param matchmaking - The ISteamMatchmaking interface.
   * @returns The records that could be read.
   */
  private async hydrateLobbies(
    lobbyIds: readonly string[],
    matchmaking: SteamMatchmakingGateway,
  ): Promise<RawLobbyRecord[]> {
    const readableIds = lobbyIds.filter((lobbyId) => this.requestLobbyData(matchmaking, lobbyId));
    if (readableIds.length === 0) {
      return [];
    }

    await this.runtime.pumpCallbacksFor(LobbyDiscoveryService.LOBBY_DATA_SETTLE_MS);

    const records: RawLobbyRecord[] = [];
    for (const lobbyId of readableIds) {
      const record = this.readLobbyRecord(lobbyId, matchmaking);
      if (record !== null) {
        records.push(record);
      }
    }

    return records;
  }

  /**
   * Asks Steam to refresh the metadata for a single lobby.
   *
   * @param matchmaking - The ISteamMatchmaking interface.
   * @param lobbyId - The lobby to refresh.
   * @returns True when the request was accepted.
   */
  private requestLobbyData(
    matchmaking: SteamMatchmakingGateway,
    lobbyId: string,
  ): boolean {
    try {
      return matchmaking.requestLobbyData(lobbyId);
    } catch {
      return false;
    }
  }

  /**
   * Reads the current state of a single lobby.
   *
   * Host identity is deliberately not resolved here: `GetLobbyOwner` returns nothing
   * for a lobby the caller has not joined, so the host is identified separately from
   * the lobby's advertised metadata.
   *
   * @param lobbyId - The lobby to read.
   * @param matchmaking - The ISteamMatchmaking interface.
   * @returns The record, or null when the lobby is no longer readable.
   */
  private readLobbyRecord(
    lobbyId: string,
    matchmaking: SteamMatchmakingGateway,
  ): RawLobbyRecord | null {
    try {
      const memberCount = matchmaking.getNumLobbyMembers(lobbyId);
      if (memberCount <= 0) {
        return null;
      }

      return {
        lobbyId,
        hostSteamId: null,
        hostName: null,
        hostSource: 'unresolved',
        memberCount,
        maxMembers: matchmaking.getLobbyMemberLimit(lobbyId),
        parameters: matchmaking.getAllLobbyData(lobbyId),
      };
    } catch {
      return null;
    }
  }
}