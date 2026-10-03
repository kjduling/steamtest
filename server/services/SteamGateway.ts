import type { LobbyListResult } from 'steamworks-ffi-node';

import type { ELobbyDistanceFilter } from 'steamworks-ffi-node';

/**
 * The slice of ISteamMatchmaking this app depends on.
 *
 * Declared as an interface rather than importing the manager directly, so the
 * discovery service can be exercised without the native Steam binary present.
 */
export interface SteamMatchmakingGateway {
  /**
   * Restricts lobby results to a geographic distance band.
   *
   * @param distance - The distance band to search within.
   */
  addRequestLobbyListDistanceFilter(distance: ELobbyDistanceFilter): void;

  /**
   * Caps the number of lobbies Steam will return.
   *
   * @param maxResults - The maximum number of results to return.
   */
  addRequestLobbyListResultCountFilter(maxResults: number): void;

  /**
   * Requests the current lobby list.
   *
   * @returns The matching lobby IDs, or a failure result.
   */
  requestLobbyList(): Promise<LobbyListResult>;

  /**
   * Asks Steam to refresh a lobby's metadata.
   *
   * @param lobbyId - The lobby to refresh.
   * @returns True when the request was accepted.
   */
  requestLobbyData(lobbyId: string): boolean;

  /**
   * Reads a lobby's current member count.
   *
   * @param lobbyId - The lobby to inspect.
   * @returns The number of members currently in the lobby.
   */
  getNumLobbyMembers(lobbyId: string): number;

  /**
   * Reads a lobby's member limit.
   *
   * @param lobbyId - The lobby to inspect.
   * @returns The maximum number of members the lobby accepts.
   */
  getLobbyMemberLimit(lobbyId: string): number;

  /**
   * Reads the Steam ID of the player who owns a lobby.
   *
   * @param lobbyId - The lobby to inspect.
   * @returns The owner's Steam ID.
   */
  getLobbyOwner(lobbyId: string): string;

  /**
   * Reads every metadata key a lobby advertises.
   *
   * @param lobbyId - The lobby to inspect.
   * @returns The lobby's metadata as key/value pairs.
   */
  getAllLobbyData(lobbyId: string): Record<string, string>;
}

/**
 * The slice of ISteamFriends this app depends on.
 */
export interface SteamFriendsGateway {
  /**
   * Returns the persona name of the signed-in user.
   *
   * @returns The signed-in user's persona name.
   */
  getPersonaName(): string;

  /**
   * Returns the persona name of a friend.
   *
   * @param steamId - Steam ID of the friend.
   * @returns The friend's persona name.
   */
  getFriendPersonaName(steamId: string): string;
}

/**
 * Everything the application needs from Steamworks.
 *
 * {@link SteamRuntimeService} is the production implementation. Keeping the
 * contract here means the services above it have no knowledge of the SDK's
 * lifecycle, only of what they can ask it to do.
 */
export interface SteamGateway {
  /**
   * Gets the matchmaking interface, or null when Steam is unavailable.
   *
   * @returns The matchmaking gateway.
   */
  getMatchmaking(): SteamMatchmakingGateway | null;

  /**
   * Gets the friends interface, or null when Steam is unavailable.
   *
   * @returns The friends gateway.
   */
  getFriends(): SteamFriendsGateway | null;

  /**
   * Reports whether Steam is usable.
   *
   * @returns True when initialised.
   */
  isReady(): boolean;

  /**
   * Gets the Steam ID of the signed-in user.
   *
   * @returns The Steam ID, or null when unknown.
   */
  getCurrentSteamId(): string | null;

  /**
   * Gets the persona name of the signed-in user.
   *
   * @returns The persona name, or null when unknown.
   */
  getCurrentPersonaName(): string | null;

  /**
   * Gets the reason Steam is unavailable.
   *
   * @returns The failure description, or null when there is none.
   */
  getFailureReason(): string | null;

  /**
   * Runs Steam callbacks for a bounded period so async replies can land.
   *
   * @param milliseconds - How long to pump callbacks for.
   */
  pumpCallbacksFor(milliseconds: number): Promise<void>;
}