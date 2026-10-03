import type { AddressInfo } from 'node:net';

import express from 'express';

import { Lobby } from '../server/models/Lobby';
import { createLobbyRouter } from '../server/routes/lobbyRoutes';
import { AppNameCatalogue } from '../server/services/AppNameCatalogue';
import type { LobbyDiscoveryService } from '../server/services/LobbyDiscoveryService';
import { LobbyDiscoveryError } from '../server/services/LobbyDiscoveryService';
import { PersonaNameResolver } from '../server/services/PersonaNameResolver';
import type { SteamGateway } from '../server/services/SteamGateway';
import type { LobbyListError, LobbyListResponse, SteamConnectionInfo } from '../shared/lobby';

/**
 * A gateway that reports Steam as unavailable.
 */
class OfflineGateway implements SteamGateway {
  public getMatchmaking(): null {
    return null;
  }

  public getFriends(): null {
    return null;
  }

  public isReady(): boolean {
    return false;
  }

  public getCurrentSteamId(): null {
    return null;
  }

  public getCurrentPersonaName(): null {
    return null;
  }

  public getFailureReason(): string {
    return 'Steam client is not running.';
  }

  public async pumpCallbacksFor(): Promise<void> {
    // Nothing to pump without a native library.
  }
}

/**
 * A discovery service stub.
 *
 * Mirrors the real service's first line of defence: when Steam has no matchmaking
 * interface, it raises a discovery error rather than returning an empty list.
 */
class StubDiscovery {
  /**
   * Creates the stub.
   *
   * @param available - Whether the lobby list should resolve successfully.
   */
  public constructor(private readonly available: boolean) {}

  /**
   * Returns a fixed lobby list, or fails when Steam is unavailable.
   *
   * @returns One lobby with parameters.
   * @throws {LobbyDiscoveryError} When the stub was created as unavailable.
   */
  public async listLobbies(): Promise<Lobby[]> {
    if (!this.available) {
      throw new LobbyDiscoveryError('Steam client is not running.');
    }

    return [
      new Lobby(
        {
          lobbyId: '109775240123456789',
          hostSteamId: 'host-1',
          hostName: 'host-one',
          hostSource: 'metadata',
          memberCount: 2,
          maxMembers: 8,
          parameters: { name: 'Deathmatch', map: 'dm_arena' },
        },
        480,
        'Spacewar',
      ),
    ];
  }
}

/**
 * Starts the router on an ephemeral port.
 *
 * @param discovery - The discovery service to expose.
 * @param runtime - The Steam gateway to describe.
 * @returns The base URL of the running server.
 */
async function startRouter(
  discovery: StubDiscovery,
  runtime: SteamGateway,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const app = express();
  app.use(
    '/api',
    createLobbyRouter(
      discovery as unknown as LobbyDiscoveryService,
      runtime,
      new PersonaNameResolver(null),
      new AppNameCatalogue(),
      480,
    ),
  );

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

const online = await startRouter(new StubDiscovery(true), {
  getMatchmaking: () => null,
  getFriends: () => null,
  isReady: () => true,
  getCurrentSteamId: () => '76561198000000001',
  getCurrentPersonaName: () => 'probe-user',
  getFailureReason: () => null,
  pumpCallbacksFor: async () => undefined,
});

try {
  const listResponse = await fetch(`${online.baseUrl}/api/lobbies`);
  if (listResponse.status !== 200) {
    throw new Error(`expected 200 from /api/lobbies, got ${listResponse.status}`);
  }

  const payload = (await listResponse.json()) as LobbyListResponse;
  if (payload.lobbies.length !== 1) {
    throw new Error(`expected one lobby, got ${payload.lobbies.length}`);
  }

  const lobby = payload.lobbies[0]!;
  if (lobby.appName !== 'Spacewar' || lobby.hostName !== 'host-one') {
    throw new Error('the lobby payload lost its identity fields');
  }

  if (lobby.parameters.length !== 2) {
    throw new Error(`expected two parameters, got ${lobby.parameters.length}`);
  }

  if (typeof payload.retrievedAt !== 'string' || Number.isNaN(Date.parse(payload.retrievedAt))) {
    throw new Error('retrievedAt is not a valid timestamp');
  }

  const steamResponse = await fetch(`${online.baseUrl}/api/steam`);
  const steam = (await steamResponse.json()) as SteamConnectionInfo;
  if (steam.connected !== true || steam.personaName !== 'probe-user') {
    throw new Error('/api/steam did not describe the connection correctly');
  }
} finally {
  await online.close();
}

const offline = await startRouter(new StubDiscovery(false), new OfflineGateway());

try {
  const offlineResponse = await fetch(`${offline.baseUrl}/api/lobbies`);
  if (offlineResponse.status !== 503) {
    throw new Error(`expected 503 when Steam is unavailable, got ${offlineResponse.status}`);
  }

  const errorPayload = (await offlineResponse.json()) as LobbyListError;
  if (!errorPayload.error.includes('Steam client is not running.')) {
    throw new Error(`unexpected error message: ${errorPayload.error}`);
  }

  if (errorPayload.steam.connected !== false) {
    throw new Error('the error payload should still describe the Steam state');
  }
} finally {
  await offline.close();
}

console.log('api checks passed');