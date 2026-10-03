import type { LobbyViewModel } from '../models/LobbyViewModel';
import { LobbyApiClient } from '../services/LobbyApiClient';
import { LobbyListView } from '../views/LobbyListView';
import type { SteamConnectionInfo } from '../../shared/lobby';

/**
 * The DOM elements the controller drives.
 */
interface ControllerElements {
  /** Button that triggers a manual refresh. */
  refreshButton: HTMLButtonElement;
  /** Element that holds the lobby cards. */
  listContainer: HTMLElement;
  /** Element that shows the connection summary line. */
  statusBar: HTMLElement;
  /** Element that shows errors or hints. */
  noticeBar: HTMLElement;
  /** Element that shows the standing capability note. */
  detailBar: HTMLElement;
}

/**
 * Orchestrates the lobby browser.
 *
 * Holds the current view state, asks the API client for data, and pushes the result
 * into the view. Automatic polling stops while the tab is hidden and while a
 * request is already in flight, so a slow query cannot queue up duplicates.
 */
export class LobbyBrowserController {
  /** How often lobbies are refreshed automatically, in milliseconds. */
  private static readonly POLL_INTERVAL_MS = 10_000;

  private readonly apiClient: LobbyApiClient;
  private readonly view: LobbyListView;
  private readonly elements: ControllerElements;
  private pollTimer: number | null = null;
  private requestInFlight = false;

  /**
   * The most recent successful result.
   *
   * Kept so a poll refreshes in place rather than blanking the list every ten
   * seconds. Cleared whenever the query fails, since stale lobbies are worse than
   * an honest empty state.
   */
  private lastLobbies: readonly LobbyViewModel[] = [];
  private lastSteam: SteamConnectionInfo = LobbyBrowserController.defaultSteamState();

  /**
   * The message currently shown above the list, if any.
   */
  private message: string | null = null;

  /**
   * Creates the controller.
   *
   * @param apiClient - Client used to fetch lobbies.
   * @param elements - The DOM elements the controller owns.
   */
  public constructor(apiClient: LobbyApiClient, elements: ControllerElements) {
    this.apiClient = apiClient;
    this.elements = elements;
    this.view = new LobbyListView({
      container: elements.listContainer,
      statusBar: elements.statusBar,
      noticeBar: elements.noticeBar,
      detailBar: elements.detailBar,
    });
  }

  /**
   * Wires up event listeners, performs the first query, and starts polling.
   */
  public start(): void {
    this.elements.refreshButton.addEventListener('click', () => {
      void this.refresh();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stopPolling();
      } else {
        this.startPolling();
        void this.refresh();
      }
    });

    void this.refresh();
    this.startPolling();
  }

  /**
   * Fetches lobbies and updates the view.
   *
   * @returns Resolves once the view has been updated.
   */
  public async refresh(): Promise<void> {
    if (this.requestInFlight) {
      return;
    }

    this.requestInFlight = true;
    this.elements.refreshButton.disabled = true;
    // Keep the previous list on screen; only the status line signals activity.
    this.render();

    try {
      const result = await this.apiClient.fetchLobbies();
      if (result.error !== null) {
        this.lastLobbies = [];
      } else {
        this.lastLobbies = result.lobbies;
      }
      this.lastSteam = result.steam;
      this.message = result.error;
    } finally {
      this.requestInFlight = false;
      this.elements.refreshButton.disabled = false;
      this.render();
    }
  }

  /**
   * Pushes the current state into the view.
   */
  private render(): void {
    this.view.render({
      lobbies: this.lastLobbies,
      steam: this.lastSteam,
      message: this.message,
      isLoading: this.requestInFlight,
    });
  }

  /**
   * Starts the automatic refresh timer.
   */
  private startPolling(): void {
    if (this.pollTimer !== null || document.hidden) {
      return;
    }
    this.pollTimer = window.setInterval(() => {
      void this.refresh();
    }, LobbyBrowserController.POLL_INTERVAL_MS);
  }

  /**
   * Stops the automatic refresh timer.
   */
  private stopPolling(): void {
    if (this.pollTimer === null) {
      return;
    }
    window.clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  /**
   * Builds the placeholder connection state used before the first response.
   *
   * @returns A neutral, disconnected state.
   */
  private static defaultSteamState(): SteamConnectionInfo {
    return {
      connected: false,
      appId: 480,
      appName: 'Spacewar',
      steamId: null,
      personaName: null,
      detail: 'Waiting for the first response from the Steam API.',
    };
  }
}