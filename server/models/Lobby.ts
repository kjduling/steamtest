import type { LobbyParameter, LobbySession } from '../../shared/lobby';
import type { LobbyHostSource } from '../services/LobbyHostResolver';

/**
 * The raw, un-namespaceed lobby data as returned by the Steamworks SDK.
 *
 * This is the transport shape between the discovery service and the model.
 */
export interface RawLobbyRecord {
  /** Steam ID of the lobby. */
  readonly lobbyId: string;
  /** Steam ID of the player who owns the lobby, or null when unknown. */
  readonly hostSteamId: string | null;
  /** Display name of the host, or null when unknown. */
  readonly hostName: string | null;
  /** Which strategy identified the host. */
  readonly hostSource: LobbyHostSource;
  /** Number of members currently in the lobby. */
  readonly memberCount: number;
  /** Maximum members the lobby accepts. */
  readonly maxMembers: number;
  /** Lobby metadata as advertised by the host, before flattening. */
  readonly parameters: Record<string, string>;
}

/**
 * A discovered Steam lobby, normalised for presentation.
 *
 * Instances are immutable. Construction performs the translation from SDK output
 * into the flat shape the API contract promises, including sorting lobby parameters
 * so the UI renders deterministically.
 */
export class Lobby {
  /** Steam ID of the lobby. */
  public readonly lobbyId: string;
  /** Steam App ID the lobby belongs to. */
  public readonly appId: number;
  /** Human readable application name. */
  public readonly appName: string;
  /** Steam ID of the player hosting the lobby, or null when unknown. */
  public readonly hostSteamId: string | null;
  /** Persona name of the host, or null when unknown. */
  public readonly hostName: string | null;
  /** Which strategy identified the host. */
  public readonly hostSource: LobbyHostSource;
  /** Current number of members in the lobby. */
  public readonly memberCount: number;
  /** Maximum number of members the lobby accepts. */
  public readonly maxMembers: number;
  /** Every parameter advertised in the lobby's session metadata. */
  public readonly parameters: readonly LobbyParameter[];

  /**
   * Creates a normalised lobby.
   *
   * @param record - Raw lobby data from the SDK.
   * @param appId - App ID the lobby was discovered under.
   * @param appName - Resolved application name.
   */
  public constructor(record: RawLobbyRecord, appId: number, appName: string) {
    this.lobbyId = record.lobbyId;
    this.appId = appId;
    this.appName = appName;
    this.hostSteamId = record.hostSteamId;
    this.hostName = record.hostName;
    this.hostSource = record.hostSource;
    this.memberCount = record.memberCount;
    this.maxMembers = record.maxMembers;
    this.parameters = Object.entries(record.parameters)
      .map(([key, value]): LobbyParameter => ({ key, value }))
      .sort((left, right) => left.key.localeCompare(right.key));
  }

  /**
   * Converts the lobby to the shape sent over the wire.
   *
   * @returns A serialisable {@link LobbySession}.
   */
  public toSession(): LobbySession {
    return {
      lobbyId: this.lobbyId,
      appId: this.appId,
      appName: this.appName,
      hostSteamId: this.hostSteamId,
      hostName: this.hostName,
      hostSource: this.hostSource,
      memberCount: this.memberCount,
      maxMembers: this.maxMembers,
      parameters: this.parameters,
    };
  }
}