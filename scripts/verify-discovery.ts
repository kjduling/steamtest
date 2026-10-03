import type { LobbyListResult } from 'steamworks-ffi-node';

import { LobbyDiscoveryService, LobbyDiscoveryError } from '../server/services/LobbyDiscoveryService';
import { AppNameCatalogue } from '../server/services/AppNameCatalogue';
import { PersonaNameResolver } from '../server/services/PersonaNameResolver';
import type {
  SteamFriendsGateway,
  SteamGateway,
  SteamMatchmakingGateway,
} from '../server/services/SteamGateway';

/** The lobbies the fake Steam client will report. */
interface FakeLobby {
  /** Steam ID of the lobby. */
  lobbyId: string;
  /** Owner the API reports, or empty when the caller has not joined. */
  apiOwner: string;
  /** Current member count. */
  members: number;
  /** Member limit. */
  limit: number;
  /** Metadata the lobby advertises. */
  data: Record<string, string>;
  /** Whether Steam will accept a metadata refresh for this lobby. */
  refreshable: boolean;
  /** Whether reading the lobby throws, simulating a lobby that just vanished. */
  unreadable: boolean;
}

/**
 * A stand-in for ISteamMatchmaking.
 *
 * Records the filters that were set so the discovery service's filter handling can
 * be asserted, and serves a configurable lobby table.
 */
class FakeMatchmaking implements SteamMatchmakingGateway {
  /** Filters set since the last list request, mirroring Steam's consume-on-use behaviour. */
  public distanceFilter: unknown = null;
  public resultCountFilter: number | null = null;
  /** Lobbies whose metadata refresh was requested. */
  public readonly refreshed: string[] = [];
  /** Owners the API reports, keyed by lobby. Absent means an empty string. */
  private readonly ownerByLobby = new Map<string, string>();

  /**
   * Creates the fake matchmaking interface.
   *
   * @param lobbies - The lobbies to serve.
   * @param listResult - The result the list request should produce.
   */
  public constructor(
    private readonly lobbies: readonly FakeLobby[],
    private readonly listResult: LobbyListResult,
  ) {
    for (const lobby of lobbies) {
      if (lobby.apiOwner.length > 0) {
        this.ownerByLobby.set(lobby.lobbyId, lobby.apiOwner);
      }
    }
  }

  public addRequestLobbyListDistanceFilter(distance: unknown): void {
    this.distanceFilter = distance;
  }

  public addRequestLobbyListResultCountFilter(maxResults: number): void {
    this.resultCountFilter = maxResults;
  }

  public async requestLobbyList(): Promise<LobbyListResult> {
    const result = this.listResult;
    // Steam clears filters once the list request has consumed them.
    this.distanceFilter = null;
    this.resultCountFilter = null;
    return result;
  }

  public requestLobbyData(lobbyId: string): boolean {
    const lobby = this.lobbies.find((candidate) => candidate.lobbyId === lobbyId);
    if (lobby === undefined || !lobby.refreshable) {
      return false;
    }
    this.refreshed.push(lobbyId);
    return true;
  }

  public getNumLobbyMembers(lobbyId: string): number {
    return this.require(lobbyId).members;
  }

  public getLobbyMemberLimit(lobbyId: string): number {
    return this.require(lobbyId).limit;
  }

  public getLobbyOwner(lobbyId: string): string {
    // Steam returns an empty string for lobbies the caller has not joined.
    return this.ownerByLobby.get(lobbyId) ?? '';
  }

  public getAllLobbyData(lobbyId: string): Record<string, string> {
    return { ...this.require(lobbyId).data };
  }

  /**
   * Looks up a lobby, failing the same way the real SDK does for unknown lobbies.
   *
   * @param lobbyId - The lobby to look up.
   * @returns The lobby definition.
   */
  private require(lobbyId: string): FakeLobby {
    const lobby = this.lobbies.find((candidate) => candidate.lobbyId === lobbyId);
    if (lobby === undefined || lobby.unreadable) {
      throw new Error('Lobby is no longer available');
    }
    return lobby;
  }
}

/**
 * A stand-in for ISteamFriends that only knows one Steam ID.
 */
class FakeFriends implements SteamFriendsGateway {
  /**
   * Returns the signed-in user's persona name.
   *
   * @returns The local persona name.
   */
  public getPersonaName(): string {
    return 'local-user';
  }

  /**
   * Returns a friend's persona name, throwing for anyone else.
   *
   * @param steamId - The Steam ID to look up.
   * @returns The persona name.
   */
  public getFriendPersonaName(steamId: string): string {
    if (steamId !== '76561198000000002') {
      throw new Error('SteamID is not a friend');
    }
    return 'friendly-host';
  }
}

/**
 * A stand-in for the SDK runtime, wiring the fakes together.
 */
class FakeRuntime implements SteamGateway {
  /** Number of times callbacks were pumped. */
  public pumpCount = 0;

  /**
   * Creates the fake runtime.
   *
   * @param matchmaking - The matchmaking stand-in.
   * @param friends - The friends stand-in.
   * @param ready - Whether Steam should report itself as available.
   */
  public constructor(
    private readonly matchmaking: SteamMatchmakingGateway | null,
    private readonly friends: SteamFriendsGateway | null,
    private readonly ready: boolean,
  ) {}

  public getMatchmaking(): SteamMatchmakingGateway | null {
    return this.matchmaking;
  }

  public getFriends(): SteamFriendsGateway | null {
    return this.friends;
  }

  public isReady(): boolean {
    return this.ready;
  }

  public getCurrentSteamId(): string | null {
    return '76561198000000001';
  }

  public getCurrentPersonaName(): string | null {
    return 'local-user';
  }

  public getFailureReason(): string | null {
    return this.ready ? null : 'Steam client is not running.';
  }

  public async pumpCallbacksFor(): Promise<void> {
    this.pumpCount += 1;
  }
}

/**
 * Asserts that a promise rejects with a LobbyDiscoveryError.
 *
 * @param operation - The operation expected to fail.
 * @param expectedMessage - Substring the message must contain.
 */
async function expectFailure(
  operation: Promise<unknown>,
  expectedMessage: string,
): Promise<void> {
  try {
    await operation;
  } catch (error) {
    if (!(error instanceof LobbyDiscoveryError)) {
      throw new Error(`expected LobbyDiscoveryError, got ${String(error)}`);
    }
    if (!error.message.includes(expectedMessage)) {
      throw new Error(`expected message to contain "${expectedMessage}", got "${error.message}"`);
    }
    return;
  }
  throw new Error(`expected a rejection containing "${expectedMessage}"`);
}

const lobbies: FakeLobby[] = [
  {
    lobbyId: 'lobby-1',
    // Discovered, not joined: the API reports no owner, metadata supplies it.
    apiOwner: '',
    members: 3,
    limit: 16,
    data: { name: 'Deathmatch', map: 'dm_arena', skill: '42', OWNINGID: '76561198000000002', OWNINGNAME: 'friendly-host' },
    refreshable: true,
    unreadable: false,
  },
  {
    lobbyId: 'lobby-2',
    apiOwner: '',
    members: 1,
    limit: 4,
    data: {},
    refreshable: true,
    unreadable: false,
  },
];

const listResult: LobbyListResult = {
  success: true,
  count: 2,
  lobbies: ['lobby-1', 'lobby-2'],
};

const matchmaking = new FakeMatchmaking(lobbies, listResult);
const runtime = new FakeRuntime(matchmaking, new FakeFriends(), true);
const discovery = new LobbyDiscoveryService(
  runtime,
  new AppNameCatalogue(),
  new PersonaNameResolver(null),
  480,
  50,
);

const discovered = await discovery.listLobbies();

if (discovered.length !== 2) {
  throw new Error(`expected 2 lobbies, got ${discovered.length}`);
}

const first = discovered[0]!;
if (first.appId !== 480 || first.appName !== 'Spacewar') {
  throw new Error(`unexpected app identity: ${first.appId} ${first.appName}`);
}

if (first.hostSteamId !== '76561198000000002') {
  throw new Error(`unexpected host id: ${String(first.hostSteamId)}`);
}

if (first.hostSource !== 'metadata') {
  throw new Error(`expected metadata host source, got ${first.hostSource}`);
}

// The advertised OWNINGNAME is authoritative, so no lookup should be needed.
if (first.hostName !== 'friendly-host') {
  throw new Error(`unexpected host name: ${String(first.hostName)}`);
}

if (first.memberCount !== 3 || first.maxMembers !== 16) {
  throw new Error(`unexpected occupancy: ${first.memberCount}/${first.maxMembers}`);
}

const parameterKeys = first.parameters.map((parameter) => parameter.key);
// Sorted locale-aware, so casing does not group all the uppercase keys together.
if (parameterKeys.join(',') !== 'map,name,OWNINGID,OWNINGNAME,skill') {
  throw new Error(`parameters were not sorted: ${parameterKeys.join(',')}`);
}

if (first.parameters.find((parameter) => parameter.key === 'map')?.value !== 'dm_arena') {
  throw new Error('lobby parameters were not carried through');
}

const second = discovered[1]!;
if (second.hostSource !== 'unresolved' || second.hostSteamId !== null) {
  throw new Error(`a lobby with no host data should be unresolved, got ${JSON.stringify(second.hostSteamId)}`);
}

if (second.parameters.length !== 0) {
  throw new Error('expected no parameters for the bare lobby');
}

if (runtime.pumpCount !== 1) {
  throw new Error(`expected callbacks to be pumped once, got ${runtime.pumpCount}`);
}

if (matchmaking.refreshed.join(',') !== 'lobby-1,lobby-2') {
  throw new Error(`unexpected refresh order: ${matchmaking.refreshed.join(',')}`);
}

const unavailable = new LobbyDiscoveryService(
  new FakeRuntime(null, null, false),
  new AppNameCatalogue(),
  new PersonaNameResolver(null),
  480,
  50,
);

await expectFailure(unavailable.listLobbies(), 'Steam client is not running');

const failing = new FakeMatchmaking(lobbies, { success: false, count: 0, lobbies: [] });
const failingDiscovery = new LobbyDiscoveryService(
  new FakeRuntime(failing, new FakeFriends(), true),
  new AppNameCatalogue(),
  new PersonaNameResolver(null),
  480,
  50,
);

await expectFailure(failingDiscovery.listLobbies(), 'did not return a lobby list');

const vanishing: FakeLobby[] = [
  {
    lobbyId: 'lobby-vanished',
    apiOwner: '',
    members: 0,
    limit: 4,
    data: {},
    refreshable: true,
    unreadable: false,
  },
];
const partial = new FakeMatchmaking(vanishing, {
  success: true,
  count: 1,
  lobbies: ['lobby-vanished'],
});
const partialDiscovery = new LobbyDiscoveryService(
  new FakeRuntime(partial, new FakeFriends(), true),
  new AppNameCatalogue(),
  new PersonaNameResolver(null),
  480,
  50,
);

const partialResult = await partialDiscovery.listLobbies();
if (partialResult.length !== 0) {
  throw new Error('a lobby with no members should be skipped, not reported');
}

console.log('discovery checks passed');