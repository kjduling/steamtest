import type { LobbyHostSource, LobbyParameter, LobbySession } from '../../shared/lobby';

/**
 * Metadata keys tried, in order, when deriving a display name for the lobby.
 *
 * Steam has no standard lobby title. Observation across a live App 480 lobby list
 * found these as the session-name keys games actually publish.
 *
 * Host and server names are deliberately excluded — `hostname`, `SteamHostName` and
 * `ct_host_name` all appear in practice, and they duplicate the Host field rather
 * than naming the session.
 */
const TITLE_KEYS: readonly string[] = [
  'name',
  'Name_s',
  'SESSIONTEMPLATENAME_s',
  'SessionName_s',
  'SERVERNAME_s',
  'Fusion_Room_Name',
  'title',
];

/**
 * Client-side view of a Steam lobby.
 *
 * Wraps the wire format with the small amount of formatting logic the UI needs,
 * so views never have to reassemble strings from raw fields.
 */
export class LobbyViewModel {
  /** Steam ID of the lobby. */
  public readonly lobbyId: string;
  /** Steam App ID the lobby belongs to. */
  public readonly appId: number;
  /** Human readable application name. */
  public readonly appName: string;
  /** Steam ID of the player hosting the lobby, or null when unknown. */
  public readonly hostSteamId: string | null;
  /** Persona name of the host, or null when unresolved. */
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
   * Creates a view model from a wire-format lobby.
   *
   * @param session - The lobby as delivered by the API.
   */
  public constructor(session: LobbySession) {
    this.lobbyId = session.lobbyId;
    this.appId = session.appId;
    this.appName = session.appName;
    this.hostSteamId = session.hostSteamId;
    this.hostName = session.hostName;
    this.hostSource = session.hostSource;
    this.memberCount = session.memberCount;
    this.maxMembers = session.maxMembers;
    this.parameters = session.parameters;
  }

  /**
   * Formats the host for display.
   *
   * Most lobbies found through a list request expose no host at all, so the
   * unknown case is stated plainly rather than rendered as a blank field.
   *
   * @returns The host name, name and ID, bare ID, or a statement of ignorance.
   */
  public formatHost(): string {
    if (this.hostName !== null && this.hostSteamId !== null) {
      return this.hostName === this.hostSteamId
        ? this.hostName
        : `${this.hostName} (${this.hostSteamId})`;
    }

    if (this.hostName !== null) {
      return `${this.hostName} (id not advertised)`;
    }

    if (this.hostSteamId !== null) {
      return this.hostSteamId;
    }

    return 'Not advertised by this session';
  }

  /**
   * Reports whether the host could be identified at all.
   *
   * @returns True when either a Steam ID or a name is known.
   */
  public hasHost(): boolean {
    return this.hostSteamId !== null || this.hostName !== null;
  }

  /**
   * Formats the lobby name for display.
   *
   * Steam exposes no lobby title, so this is a best-effort lookup of whichever
   * session-name key the game chose to publish. Failing that, a shortened lobby ID
   * keeps the row identifiable.
   *
   * @returns The advertised session name, or a shortened lobby ID.
   */
  public formatName(): string {
    for (const key of TITLE_KEYS) {
      const value = this.parameters.find((parameter) => parameter.key === key)?.value?.trim();
      if (value !== undefined && value.length > 0) {
        return value;
      }
    }
    return `Lobby ${this.lobbyId.slice(-6)}`;
  }

  /**
   * Reports whether the lobby advertises any session parameters.
   *
   * @returns True when at least one parameter is present.
   */
  public hasParameters(): boolean {
    return this.parameters.length > 0;
  }
}