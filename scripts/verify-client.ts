import { LobbyViewModel } from '../src/models/LobbyViewModel';
import { LobbyListView } from '../src/views/LobbyListView';
import type { LobbySession, SteamConnectionInfo } from '../shared/lobby';

/**
 * Minimal DOM stand-ins, sufficient for the view's element construction.
 *
 * Avoids pulling a full DOM implementation into a proof of concept that otherwise
 * has no test infrastructure.
 */
class FakeElement {
  public readonly children: FakeElement[] = [];
  public readonly dataset: Record<string, string> = {};
  public className = '';
  public hidden = false;
  public textContent = '';
  public readonly isFragment: boolean;

  public constructor(public readonly tagName: string, isFragment = false) {
    this.isFragment = isFragment;
  }

  public append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      if (node.isFragment) {
        this.children.push(...node.children);
      } else {
        this.children.push(node);
      }
    }
  }

  public replaceChildren(...nodes: FakeElement[]): void {
    this.children.length = 0;
    this.append(...nodes);
  }
}

/**
 * Installs a minimal `document` global so the view can be exercised under Node.
 */
function installDocumentStub(): void {
  const stub = {
    createElement: (tagName: string): FakeElement => new FakeElement(tagName),
    createDocumentFragment: (): FakeElement => new FakeElement('#fragment', true),
  };

  Reflect.set(globalThis, 'document', stub);
}

/**
 * Reads an element's text through a call boundary.
 *
 * Without this, TypeScript narrows the property to the literal it was last assigned
 * and flags every later comparison as impossible.
 *
 * @param element - The element to read.
 * @returns The element's text content.
 */
function readText(element: FakeElement): string {
  return element.textContent;
}

/**
 * Counts an element's direct children through a call boundary, for the same reason.
 *
 * @param element - The element to inspect.
 * @returns The number of direct children.
 */
function countChildren(element: FakeElement): number {
  return element.children.length;
}

/**
 * Reads an element's hidden flag through a call boundary, for the same reason.
 *
 * @param element - The element to inspect.
 * @returns The element's hidden flag.
 */
function isHidden(element: FakeElement): boolean {
  return element.hidden;
}

installDocumentStub();

const connected: SteamConnectionInfo = {
  connected: true,
  appId: 480,
  appName: 'Spacewar',
  steamId: '76561198000000001',
  personaName: 'probe-user',
  detail: 'Host names resolved via the Steam Web API.',
};

const sessions: LobbySession[] = [
  {
    lobbyId: '109775240123456789',
    appId: 480,
    appName: 'Spacewar',
    hostSteamId: '76561198000000002',
    hostName: 'host-one',
    hostSource: 'metadata',
    memberCount: 3,
    maxMembers: 16,
    parameters: [
      { key: 'name', value: 'Deathmatch' },
      { key: 'map', value: 'dm_arena' },
      { key: 'skill', value: '42' },
    ],
  },
  {
    lobbyId: '109775240987654321',
    appId: 480,
    appName: 'Spacewar',
    hostSteamId: null,
    hostName: null,
    hostSource: 'unresolved',
    memberCount: 1,
    maxMembers: 4,
    parameters: [],
  },
];

const models = sessions.map((session) => new LobbyViewModel(session));

if (models[0]!.formatName() !== 'Deathmatch') {
  throw new Error(`expected lobby name from parameters, got ${models[0]!.formatName()}`);
}

if (models[0]!.formatHost() !== 'host-one (76561198000000002)') {
  throw new Error(`unexpected host format: ${models[0]!.formatHost()}`);
}

if (models[0]!.hasHost() !== true) {
  throw new Error('a lobby with a host should report hasHost');
}

if (models[1]!.hasHost() !== false) {
  throw new Error('a lobby with no host should not report hasHost');
}

if (models[1]!.formatHost() !== 'Not advertised by this session') {
  throw new Error(`expected an explicit unknown host, got ${models[1]!.formatHost()}`);
}

if (models[1]!.formatName() !== 'Lobby 654321') {
  throw new Error(`expected shortened id fallback, got ${models[1]!.formatName()}`);
}

// Host and server names must not be mistaken for a session name.
{
  const hostNamed = new LobbyViewModel({
    ...sessions[1]!,
    parameters: [
      { key: 'hostname', value: 'a-dedicated-server' },
      { key: 'SteamHostName', value: 'another-server' },
    ],
  });

  if (hostNamed.formatName() !== 'Lobby 654321') {
    throw new Error(`a host name was used as the title: ${hostNamed.formatName()}`);
  }
}

// A real session-name key should be preferred over the ID fallback.
{
  const sessionNamed = new LobbyViewModel({
    ...sessions[1]!,
    parameters: [
      { key: 'Map_s', value: 'SnowLevel' },
      { key: 'SessionName_s', value: 'tttttt' },
    ],
  });

  if (sessionNamed.formatName() !== 'tttttt') {
    throw new Error(`unexpected session name: ${sessionNamed.formatName()}`);
  }
}

// A blank value should fall through rather than render as an empty title.
{
  const blankNamed = new LobbyViewModel({
    ...sessions[1]!,
    parameters: [
      { key: 'name', value: '   ' },
      { key: 'SessionName_s', value: 'real-name' },
    ],
  });

  if (blankNamed.formatName() !== 'real-name') {
    throw new Error(`a blank title was not skipped: ${blankNamed.formatName()}`);
  }
}

if (models[0]!.hasParameters() !== true || models[1]!.hasParameters() !== false) {
  throw new Error('parameter presence detection is wrong');
}

const statusBar = new FakeElement('p');
const noticeBar = new FakeElement('p');
const detailBar = new FakeElement('p');
const container = new FakeElement('div');
const view = new LobbyListView({
  container: container as unknown as HTMLElement,
  statusBar: statusBar as unknown as HTMLElement,
  noticeBar: noticeBar as unknown as HTMLElement,
  detailBar: detailBar as unknown as HTMLElement,
});

view.render({ lobbies: models, steam: connected, message: null, isLoading: false });

if (readText(statusBar) !== 'probe-user · Spacewar (App 480)') {
  throw new Error(`unexpected status text: ${readText(statusBar)}`);
}

if (countChildren(container) !== 2) {
  throw new Error(`expected 2 lobby cards, got ${countChildren(container)}`);
}

const firstCard = container.children[0]!;
if (firstCard.className !== 'lobby') {
  throw new Error(`unexpected card class: ${firstCard.className}`);
}

const secondCard = container.children[1]!;
const parametersBlock = secondCard.children[2]!;
if (parametersBlock.children[0]!.textContent !== 'This session advertises no parameters.') {
  throw new Error('missing empty-parameters placeholder');
}

view.render({
  lobbies: [],
  steam: { ...connected, connected: false, personaName: null, detail: 'SDK missing.' },
  message: 'Steam is not available.',
  isLoading: false,
});

if (noticeBar.hidden !== false || noticeBar.textContent !== 'Steam is not available.') {
  throw new Error('notice bar was not populated');
}

if (isHidden(detailBar) !== true) {
  throw new Error('the capability note should be hidden while disconnected');
}

if (readText(statusBar) !== 'Steam client not connected') {
  throw new Error(`unexpected disconnected status: ${readText(statusBar)}`);
}

if (countChildren(container) !== 1 || container.children[0]!.className !== 'placeholder') {
  throw new Error('expected a placeholder when there are no lobbies');
}

view.render({ lobbies: models, steam: connected, message: null, isLoading: true });

if (readText(statusBar) !== 'Refreshing · probe-user · Spacewar (App 480)') {
  throw new Error(`unexpected loading status: ${readText(statusBar)}`);
}

if (isHidden(detailBar) !== false) {
  throw new Error('the capability note should be shown while connected');
}

if (readText(detailBar) !== 'Host names resolved via the Steam Web API.') {
  throw new Error(`unexpected capability note: ${readText(detailBar)}`);
}

console.log('client logic checks passed');