import { Lobby } from '../server/models/Lobby';
import { AppNameCatalogue } from '../server/services/AppNameCatalogue';
import { PersonaNameResolver } from '../server/services/PersonaNameResolver';
import type { RawLobbyRecord } from '../server/models/Lobby';

/**
 * Records the Steam IDs the local friends lookup was asked about, so the test can
 * assert that non-friends fall through to the remote path without hitting Steam.
 */
class FakeFriends {
  public readonly asked: string[] = [];

  /**
   * Mimics ISteamFriends by throwing for anyone who is not a friend.
   *
   * @param steamId - The Steam ID being looked up.
   * @returns The persona name for known friends.
   */
  public getFriendPersonaName(steamId: string): string {
    this.asked.push(steamId);
    if (steamId === 'friend-1') {
      return 'friend-one';
    }
    if (steamId === 'private-2') {
      // Steam's placeholder for an account whose profile is private.
      return '[unknown]';
    }
    throw new Error('SteamID is not a friend');
  }
}

const raw: RawLobbyRecord = {
  lobbyId: '109775240000000001',
  hostSteamId: 'friend-1',
  hostName: 'friend-one',
  hostSource: 'metadata',
  memberCount: 2,
  maxMembers: 8,
  parameters: { map: 'dm_arena', name: 'Deathmatch', appid: '480' },
};

const session = new Lobby(raw, 480, 'Spacewar').toSession();

if (session.lobbyId !== raw.lobbyId || session.hostSteamId !== 'friend-1') {
  throw new Error('identity fields were not carried through');
}

if (session.appName !== 'Spacewar' || session.appId !== 480) {
  throw new Error('app identity was not carried through');
}

if (session.hostSource !== 'metadata') {
  throw new Error('the host resolution strategy was not carried through');
}

if (session.memberCount !== 2 || session.maxMembers !== 8) {
  throw new Error('membership counts were not carried through');
}

const parameterKeys = session.parameters.map((parameter) => parameter.key);
const sortedKeys = [...parameterKeys].sort((left, right) => left.localeCompare(right));
if (parameterKeys.join(',') !== sortedKeys.join(',')) {
  throw new Error(`parameters are not sorted: ${parameterKeys.join(',')}`);
}

if (session.parameters.length !== 3) {
  throw new Error(`expected 3 parameters, got ${session.parameters.length}`);
}

const unidentified = new Lobby(
  { ...raw, hostSteamId: null, hostName: null, hostSource: 'unresolved' },
  480,
  'Spacewar',
).toSession();

if (unidentified.hostName !== null || unidentified.hostSteamId !== null) {
  throw new Error('an unresolved host should stay null, not become a placeholder');
}

if (unidentified.hostSource !== 'unresolved') {
  throw new Error('the unresolved source was not carried through');
}

const catalogue = new AppNameCatalogue();
if (catalogue.resolve(480) !== 'Spacewar') {
  throw new Error('App 480 should resolve to Spacewar');
}

if (catalogue.resolve(1234) !== 'App 1234') {
  throw new Error(`unknown App IDs should fall back, got ${catalogue.resolve(1234)}`);
}

const friends = new FakeFriends();
const resolver = new PersonaNameResolver(null);

if (resolver.canResolveAnySteamId()) {
  throw new Error('a resolver without a key must not claim full coverage');
}

const localName = resolver.resolve('friend-1', friends);
if (localName !== 'friend-one') {
  throw new Error(`expected the friend name, got ${String(localName)}`);
}

if (resolver.resolve('stranger-9', friends) !== null) {
  throw new Error('a non-friend without a key should resolve to null');
}

if (resolver.resolve('private-2', friends) !== null) {
  throw new Error('the [unknown] placeholder must resolve to null, not a name');
}

const batch = await resolver.resolveMany(['friend-1', 'stranger-9'], friends);
if (batch.get('friend-1') !== 'friend-one') {
  throw new Error('batch resolution should reuse the friend lookup');
}

if (batch.has('stranger-9')) {
  throw new Error('batch resolution should omit unresolvable ids');
}

const originalFetch = globalThis.fetch;

/**
 * Points `fetch` at a canned Steam Web API response.
 *
 * @param players - The players the stubbed endpoint should report.
 * @returns A getter for the URL that was requested.
 */
function stubSteamWebApi(
  players: Array<{ steamid: string; personaname: string }>,
): () => string {
  let requestedUrl = '';
  Reflect.set(globalThis, 'fetch', async (input: string | URL): Promise<Response> => {
    requestedUrl = typeof input === 'string' ? input : input.toString();
    return new Response(JSON.stringify({ response: { players } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return () => requestedUrl;
}

try {
  const requestedUrl = stubSteamWebApi([
    { steamid: 'stranger-9', personaname: 'stranger-nine' },
    { steamid: 'private-3', personaname: '[unknown]' },
    { steamid: 'friend-1', personaname: 'ignored' },
  ]);

  const keyedResolver = new PersonaNameResolver('test-key');
  const keyedBatch = await keyedResolver.resolveMany(
    ['stranger-9', 'private-3', 'friend-1'],
    null,
  );

  if (keyedBatch.get('stranger-9') !== 'stranger-nine') {
    throw new Error('the Web API path did not resolve a non-friend');
  }

  if (keyedBatch.has('private-3')) {
    throw new Error('a [unknown] from the Web API must be discarded, not cached as a name');
  }

  const url = requestedUrl();
  if (!url.includes('key=test-key') || !url.includes('steamids=stranger-9')) {
    throw new Error(`unexpected Web API request: ${url}`);
  }
} finally {
  Reflect.set(globalThis, 'fetch', originalFetch);
}

console.log('server logic checks passed');