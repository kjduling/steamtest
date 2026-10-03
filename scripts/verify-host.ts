import { LobbyHostResolver } from '../server/services/LobbyHostResolver';

/**
 * Builds a resolver over canned inputs.
 *
 * @param apiOwner - What the matchmaking interface reports as the owner.
 * @param names - Names the network lookup can resolve.
 * @returns The resolver plus a record of which Steam IDs were looked up.
 */
function buildResolver(
  apiOwner: string,
  names: Record<string, string> = {},
): { resolver: LobbyHostResolver; looked: string[][] } {
  const looked: string[][] = [];
  const resolver = new LobbyHostResolver(
    () => apiOwner,
    async (steamIds) => {
      looked.push([...steamIds]);
      const resolved = new Map<string, string>();
      for (const steamId of steamIds) {
        const name = names[steamId];
        if (name !== undefined) {
          resolved.set(steamId, name);
        }
      }
      return resolved;
    },
  );
  return { resolver, looked };
}

// Steam returns an empty string, not zero, for lobbies the caller has not joined.
{
  const { resolver } = buildResolver('');
  const host = await resolver.resolve('lobby-1', {
    OWNINGID: '76561199025700348',
    OWNINGNAME: 'hipie09',
  });

  if (host.source !== 'metadata') {
    throw new Error(`expected metadata resolution, got ${host.source}`);
  }

  if (host.steamId !== '76561199025700348') {
    throw new Error(`unexpected host id: ${String(host.steamId)}`);
  }

  // Metadata carries the name, so no network lookup should happen.
  if (host.name !== 'hipie09') {
    throw new Error(`expected the advertised name, got ${String(host.name)}`);
  }
}

// The SteamNetworkingSockets convention: P2PADDR is the host, matching OWNINGID.
{
  const { resolver } = buildResolver('');
  const host = await resolver.resolve('lobby-2', {
    P2PADDR: '76561199103183083',
    OWNINGID: '76561199103183083',
    OWNINGNAME: 'RoRvzzz',
  });

  if (host.steamId !== '76561199103183083' || host.name !== 'RoRvzzz') {
    throw new Error(`unexpected identity: ${String(host.steamId)} ${String(host.name)}`);
  }
}

// An ID with no advertised name should trigger a name lookup.
{
  const { resolver, looked } = buildResolver('', { '76561199237599023': 'resolved-later' });
  const host = await resolver.resolve('lobby-3', { OI: '76561199237599023' });

  if (host.steamId !== '76561199237599023') {
    throw new Error('OI should be accepted as a host id');
  }

  if (host.name !== 'resolved-later') {
    throw new Error(`expected the looked-up name, got ${String(host.name)}`);
  }

  if (looked.length !== 1 || looked[0]![0] !== '76561199237599023') {
    throw new Error('a name lookup should have been performed exactly once');
  }
}

// A real observed case: 29 of 50 lobbies advertise no host whatsoever.
{
  const { resolver, looked } = buildResolver('');
  const host = await resolver.resolve('lobby-4', {
    P2PPORT: '7777',
    CONMETHOD: 'P2P',
    buildid: '20471',
  });

  if (host.source !== 'unresolved' || host.steamId !== null || host.name !== null) {
    throw new Error(`expected an unresolved host, got ${JSON.stringify(host)}`);
  }

  if (looked.length !== 0) {
    throw new Error('no lookup should be attempted without a Steam ID');
  }
}

// A name with no ID is still better than nothing.
{
  const { resolver } = buildResolver('');
  const host = await resolver.resolve('lobby-5', { OWNINGNAME: 'nameless-host' });

  if (host.source !== 'unresolved' || host.name !== 'nameless-host') {
    throw new Error(`expected an advertised name, got ${JSON.stringify(host)}`);
  }
}

// When the API does return an owner, it must win over metadata.
{
  const { resolver } = buildResolver('76561198052972851');
  const host = await resolver.resolve('lobby-6', { OWNINGID: '76561199025700348' });

  if (host.source !== 'api' || host.steamId !== '76561198052972851') {
    throw new Error(`the API owner should take precedence, got ${JSON.stringify(host)}`);
  }
}

// Values that are not Steam IDs must not be mistaken for one.
{
  const { resolver } = buildResolver('');
  const host = await resolver.resolve('lobby-7', {
    // A port, not an ID: too short to be a Steam ID64.
    P2PADDR: '7777',
    // 17 digits but below the individual-account range.
    OWNINGID: '00000000000000001',
    OI: '   ',
  });

  if (host.steamId !== null) {
    throw new Error(`non-ID values were accepted as a host: ${String(host.steamId)}`);
  }
}

// `2A` is documented as a client port but is used as an ID by some games. It is
// excluded from the candidate keys, so it must not be treated as the host.
{
  const { resolver } = buildResolver('');
  const host = await resolver.resolve('lobby-8', { '2A': '76561199237599023' });

  if (host.steamId !== null) {
    throw new Error(`2A should not be trusted as a host id, got ${String(host.steamId)}`);
  }
}

// Whitespace around a valid ID must not defeat the match.
{
  const { resolver } = buildResolver('');
  const host = await resolver.resolve('lobby-9', { OWNINGID: '  76561199025700348  ' });

  if (host.steamId !== '76561199025700348') {
    throw new Error(`untrimmed id was not accepted: ${String(host.steamId)}`);
  }
}

// Steam answers with a literal `[unknown]` when a profile is private. That must not
// be presented as a name, whether it arrives from the API or from metadata.
{
  const { resolver } = buildResolver('', { '76561199237599023': '[unknown]' });
  const host = await resolver.resolve('lobby-10', { OI: '76561199237599023' });

  if (host.steamId !== '76561199237599023') {
    throw new Error('the host id should still be recovered');
  }

  if (host.name !== null) {
    throw new Error(`the [unknown] placeholder leaked through as a name: ${host.name}`);
  }
}

{
  const { resolver } = buildResolver('');
  const host = await resolver.resolve('lobby-11', {
    OI: '76561199237599023',
    OWNINGNAME: '[unknown]',
  });

  if (host.name !== null) {
    throw new Error(`a metadata [unknown] leaked through as a name: ${host.name}`);
  }
}

// A clan tag is a legitimate name prefix and must survive.
{
  const { resolver } = buildResolver('');
  const host = await resolver.resolve('lobby-12', {
    OWNINGID: '76561199025700348',
    OWNINGNAME: '[OLD] hipie09',
  });

  if (host.name !== '[OLD] hipie09') {
    throw new Error(`a clan-tagged name was mangled: ${String(host.name)}`);
  }
}

console.log('host resolver checks passed');