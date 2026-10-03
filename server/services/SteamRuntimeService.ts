import { SteamworksSDK } from 'steamworks-ffi-node';

import type {
  SteamFriendsGateway,
  SteamGateway,
  SteamMatchmakingGateway,
} from './SteamGateway';
import { usablePersonaName } from './PersonaName';

/**
 * Owns the lifecycle of the Steamworks SDK singleton.
 *
 * The SDK must be initialised once per process and callbacks must be pumped on a
 * regular cadence, so this class is deliberately a singleton. Failure to initialise
 * is captured rather than thrown, because the client is expected to render a
 * readable diagnostic instead of crashing the server.
 */
export class SteamRuntimeService implements SteamGateway {
  private static instance: SteamRuntimeService | null = null;

  private readonly sdk: SteamworksSDK;
  private callbackTimer: NodeJS.Timeout | null = null;
  private initialised = false;
  private failureReason: string | null = null;

  /**
   * Creates the runtime wrapper around the Steamworks SDK singleton.
   */
  private constructor() {
    this.sdk = SteamworksSDK.getInstance();
  }

  /**
   * Returns the process-wide runtime instance.
   *
   * @returns The shared {@link SteamRuntimeService}.
   */
  public static getInstance(): SteamRuntimeService {
    if (SteamRuntimeService.instance === null) {
      SteamRuntimeService.instance = new SteamRuntimeService();
    }
    return SteamRuntimeService.instance;
  }

  /**
   * Initialises the Steamworks SDK and starts the callback pump.
   *
   * @param appId - Steam App ID to bind the session to.
   * @returns True when the SDK initialised, false when it did not.
   */
  public start(appId: number): boolean {
    if (this.initialised) {
      return true;
    }

    try {
      this.initialised = this.sdk.init({ appId });
      if (!this.initialised) {
        this.failureReason = this.describeMissingPrerequisites();
      }
    } catch (error) {
      this.initialised = false;
      this.failureReason = error instanceof Error ? error.message : String(error);
    }

    if (this.initialised) {
      this.startCallbackPump();
    }

    return this.initialised;
  }

  /**
   * Gets the underlying matchmaking interface.
   *
   * @returns The matchmaking manager, or null when the SDK is unavailable.
   */
  public getMatchmaking(): SteamMatchmakingGateway | null {
    if (!this.initialised) {
      return null;
    }
    return this.sdk.matchmaking;
  }

  /**
   * Gets the friends interface for persona lookups.
   *
   * @returns The friends manager, or null when the SDK is unavailable.
   */
  public getFriends(): SteamFriendsGateway | null {
    if (!this.initialised) {
      return null;
    }
    return this.sdk.friends;
  }

  /**
   * Reports whether the SDK is usable.
   *
   * @returns True when initialised.
   */
  public isReady(): boolean {
    return this.initialised;
  }

  /**
   * Gets the Steam ID of the signed-in user.
   *
   * @returns The Steam ID string, or null when it cannot be determined.
   */
  public getCurrentSteamId(): string | null {
    if (!this.initialised) {
      return null;
    }
    try {
      return this.sdk.getStatus().steamId;
    } catch {
      return null;
    }
  }

  /**
   * Gets the persona name of the signed-in user.
   *
   * @returns The persona name, or null when it cannot be determined.
   */
  public getCurrentPersonaName(): string | null {
    const friends = this.getFriends();
    if (friends === null) {
      return null;
    }
    try {
      return usablePersonaName(friends.getPersonaName());
    } catch {
      return null;
    }
  }

  /**
   * Runs Steam callbacks repeatedly for a bounded period.
   *
   * `RequestLobbyData` is fire-and-forget: the payload arrives asynchronously on a
   * lobby data update callback. This gives those callbacks a chance to land before
   * the caller reads the lobby metadata.
   *
   * @param milliseconds - How long to pump callbacks for.
   */
  public async pumpCallbacksFor(milliseconds: number): Promise<void> {
    const deadline = Date.now() + milliseconds;
    while (Date.now() < deadline) {
      try {
        this.sdk.runCallbacks();
      } catch {
        // A failed pump tick should not abort the wait.
      }
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
  }

  /**
   * Gets the reason the SDK failed to initialise.
   *
   * @returns The failure description, or null when there is none.
   */
  public getFailureReason(): string | null {
    return this.failureReason;
  }

  /**
   * Stops the callback pump and shuts the SDK down.
   */
  public stop(): void {
    if (this.callbackTimer !== null) {
      clearInterval(this.callbackTimer);
      this.callbackTimer = null;
    }

    if (this.initialised) {
      try {
        this.sdk.shutdown();
      } catch {
        // Shutdown is best effort; the process is exiting either way.
      }
    }

    this.initialised = false;
  }

  /**
   * Begins pumping Steam callbacks on a fixed interval.
   *
   * Lobby queries block on Steam's own async callback machinery, but keeping the
   * standard pump alive means library state such as persona names stays fresh.
   */
  private startCallbackPump(): void {
    if (this.callbackTimer !== null) {
      return;
    }
    this.callbackTimer = setInterval(() => {
      try {
        this.sdk.runCallbacks();
      } catch {
        // A failed pump tick should not take the server down.
      }
    }, 1000);
    this.callbackTimer.unref();
  }

  /**
   * Builds a human readable description of why initialisation failed.
   *
   * @returns A diagnostic string for display in the client.
   */
  private describeMissingPrerequisites(): string {
    return [
      'Steamworks SDK did not initialise.',
      'Required: the Steam client must be running and signed in, and',
      'steamworks_sdk/redistributable_bin must contain the native Steam API binary',
      '(see steamworks_sdk/README.md for setup steps).',
    ].join(' ');
  }
}