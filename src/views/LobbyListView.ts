import type { LobbyViewModel } from '../models/LobbyViewModel';
import type { SteamConnectionInfo } from '../../shared/lobby';

/**
 * Renders the lobby list into a container element.
 *
 * The view is intentionally dumb: it takes already-formatted models and a state
 * object, and rebuilds its markup. It never fetches data or decides when to fetch.
 */
export class LobbyListView {
  private readonly container: HTMLElement;
  private readonly statusBar: HTMLElement;
  private readonly noticeBar: HTMLElement;
  private readonly detailBar: HTMLElement;

  /**
   * Binds the view to its DOM elements.
   *
   * @param elements - The elements the view owns.
   */
  public constructor(elements: {
    /** Element that holds the lobby cards or an empty state. */
    container: HTMLElement;
    /** Element that shows the connection summary line. */
    statusBar: HTMLElement;
    /** Element that shows errors or hints. */
    noticeBar: HTMLElement;
    /** Element that shows the standing capability note. */
    detailBar: HTMLElement;
  }) {
    this.container = elements.container;
    this.statusBar = elements.statusBar;
    this.noticeBar = elements.noticeBar;
    this.detailBar = elements.detailBar;
  }

  /**
   * Renders the complete view state.
   *
   * @param state - The state to display.
   */
  public render(state: {
    /** Lobbies to list. */
    lobbies: readonly LobbyViewModel[];
    /** Steam connection state. */
    steam: SteamConnectionInfo;
    /** Message to display above the list, or null for none. */
    message: string | null;
    /** Whether a request is currently in flight. */
    isLoading: boolean;
  }): void {
    this.statusBar.textContent = LobbyListView.formatStatus(state.steam, state.isLoading);
    this.statusBar.dataset.connected = String(state.steam.connected);

    // The capability note matters whether or not any lobbies turned up, so it is
    // rendered independently of the list.
    if (state.steam.connected && state.steam.detail !== null) {
      this.detailBar.hidden = false;
      this.detailBar.textContent = state.steam.detail;
    } else {
      this.detailBar.hidden = true;
      this.detailBar.textContent = '';
    }

    if (state.message === null) {
      this.noticeBar.hidden = true;
      this.noticeBar.textContent = '';
    } else {
      this.noticeBar.hidden = false;
      this.noticeBar.textContent = state.message;
    }

    if (state.lobbies.length === 0) {
      this.container.replaceChildren(LobbyListView.buildEmptyState(state.steam, state.isLoading));
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const lobby of state.lobbies) {
      fragment.append(LobbyListView.buildLobbyCard(lobby));
    }
    this.container.replaceChildren(fragment);
  }

  /**
   * Formats the connection summary line.
   *
   * @param steam - The Steam connection state.
   * @param isLoading - Whether a request is in flight.
   * @returns The text for the status bar.
   */
  private static formatStatus(steam: SteamConnectionInfo, isLoading: boolean): string {
    if (!steam.connected) {
      return isLoading ? 'Connecting to Steam…' : 'Steam client not connected';
    }

    const identity = steam.personaName ?? steam.steamId ?? 'unknown user';
    const summary = `${identity} · ${steam.appName} (App ${steam.appId})`;
    return isLoading ? `Refreshing · ${summary}` : summary;
  }

  /**
   * Builds the placeholder shown when there is nothing to list.
   *
   * @param steam - The Steam connection state.
   * @param isLoading - Whether a request is in flight.
   * @returns The placeholder element.
   */
  private static buildEmptyState(steam: SteamConnectionInfo, isLoading: boolean): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'placeholder';

    if (!steam.connected) {
      wrapper.append(
        LobbyListView.buildParagraph('No lobbies available: the Steamworks SDK is not initialised.'),
        LobbyListView.buildParagraph('Start Steam, sign in, install the SDK redistributables, then refresh.'),
      );
      return wrapper;
    }

    wrapper.append(
      LobbyListView.buildParagraph(
        isLoading ? 'Asking Steam for lobbies…' : 'No lobbies are currently advertising this app.',
      ),
    );

    return wrapper;
  }

  /**
   * Builds the card for a single lobby.
   *
   * @param lobby - The lobby to render.
   * @returns The card element.
   */
  private static buildLobbyCard(lobby: LobbyViewModel): HTMLElement {
    const card = document.createElement('article');
    card.className = 'lobby';

    const header = document.createElement('header');
    header.className = 'lobby__header';

    const title = document.createElement('h3');
    title.className = 'lobby__title';
    title.textContent = lobby.formatName();

    const occupancy = document.createElement('span');
    occupancy.className = 'lobby__occupancy';
    occupancy.textContent = `${lobby.memberCount}/${lobby.maxMembers}`;

    header.append(title, occupancy);

    const meta = document.createElement('dl');
    meta.className = 'lobby__meta';
    LobbyListView.appendDefinition(meta, 'App', `${lobby.appName} (${lobby.appId})`);
    LobbyListView.appendDefinition(
      meta,
      'Host',
      lobby.hasHost() ? lobby.formatHost() : 'Not advertised',
    );
    if (!lobby.hasHost()) {
      // Flag the gaps so a sparse lobby does not read as a broken one.
      meta.dataset.unknownHost = 'true';
    }
    LobbyListView.appendDefinition(meta, 'Lobby ID', lobby.lobbyId);

    card.append(header, meta);

    const parameters = document.createElement('div');
    parameters.className = 'lobby__parameters';

    if (!lobby.hasParameters()) {
      const empty = document.createElement('p');
      empty.className = 'lobby__parameters-empty';
      empty.textContent = 'This session advertises no parameters.';
      parameters.append(empty);
    } else {
      const heading = document.createElement('h4');
      heading.textContent = 'Session parameters';
      parameters.append(heading);

      const list = document.createElement('ul');
      list.className = 'parameters';
      for (const parameter of lobby.parameters) {
        const item = document.createElement('li');
        const key = document.createElement('span');
        key.className = 'parameters__key';
        key.textContent = parameter.key;
        const value = document.createElement('span');
        value.className = 'parameters__value';
        value.textContent = parameter.value;
        item.append(key, value);
        list.append(item);
      }
      parameters.append(list);
    }

    card.append(parameters);
    return card;
  }

  /**
   * Appends a term and definition pair to a description list.
   *
   * @param list - The description list to append to.
   * @param term - The label.
   * @param value - The value.
   */
  private static appendDefinition(list: HTMLDListElement, term: string, value: string): void {
    const termElement = document.createElement('dt');
    termElement.textContent = term;
    const valueElement = document.createElement('dd');
    valueElement.textContent = value;
    list.append(termElement, valueElement);
  }

  /**
   * Creates a paragraph element with the given text.
   *
   * @param text - The paragraph text.
   * @returns The paragraph element.
   */
  private static buildParagraph(text: string): HTMLParagraphElement {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    return paragraph;
  }
}