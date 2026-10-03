/**
 * Shared contract types used by both the Node server and the browser client.
 *
 * Keeping these in a single module avoids drift between the two halves of the app.
 */

/** A single key/value pair attached to a lobby session. */
export interface LobbyParameter {
  /** The parameter key as advertised by the hosting session. */
  readonly key: string;
  /** The parameter value as advertised by the hosting session. */
  readonly value: string;
}

/** How the host of a lobby was identified. */
export type LobbyHostSource =
  /** The Steamworks API returned the owner directly. */
  | 'api'
  /** The owner was recovered from the lobby's advertised metadata. */
  | 'metadata'
  /** No host information could be recovered. */
  | 'unresolved';

/** A Steam lobby discovered for the target application. */
export interface LobbySession {
  /** Steam ID of the lobby itself. */
  readonly lobbyId: string;
  /** Steam App ID the lobby belongs to. */
  readonly appId: number;
  /** Human readable application name, when it can be resolved. */
  readonly appName: string;
  /** Steam ID of the player hosting the lobby, or null when unknown. */
  readonly hostSteamId: string | null;
  /** Persona name of the host, or null when it can be resolved. */
  readonly hostName: string | null;
  /** Which strategy identified the host. */
  readonly hostSource: LobbyHostSource;
  /** Current number of members in the lobby. */
  readonly memberCount: number;
  /** Maximum number of members the lobby accepts. */
  readonly maxMembers: number;
  /** Every parameter advertised in the lobby's session metadata. */
  readonly parameters: readonly LobbyParameter[];
}

/** Connection details for the local Steam client. */
export interface SteamConnectionInfo {
  /** Whether the Steamworks API initialised successfully. */
  readonly connected: boolean;
  /** App ID the SDK was initialised with. */
  readonly appId: number;
  /** Human readable name of that App ID. */
  readonly appName: string;
  /** Steam ID of the signed-in user, when known. */
  readonly steamId: string | null;
  /** Persona name of the signed-in user, when known. */
  readonly personaName: string | null;
  /** Human readable note about availability or capability. */
  readonly detail: string | null;
}

/** Successful lobby listing payload. */
export interface LobbyListResponse {
  readonly steam: SteamConnectionInfo;
  readonly lobbies: readonly LobbySession[];
  /** Wall-clock time the listing was produced. */
  readonly retrievedAt: string;
}

/** Error payload returned by the API. */
export interface LobbyListError {
  readonly error: string;
  readonly steam: SteamConnectionInfo;
}