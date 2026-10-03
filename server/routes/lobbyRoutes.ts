import { Router, type Request, type Response } from 'express';

import type { LobbyListError, LobbyListResponse, SteamConnectionInfo } from '../../shared/lobby';
import { AppNameCatalogue } from '../services/AppNameCatalogue';
import { LobbyDiscoveryService, LobbyDiscoveryError } from '../services/LobbyDiscoveryService';
import { PersonaNameResolver } from '../services/PersonaNameResolver';
import type { SteamGateway } from '../services/SteamGateway';

/**
 * Builds the Express router that exposes lobby discovery to the client.
 *
 * The router owns no Steam state itself; it depends on the runtime and discovery
 * services so that HTTP concerns stay separate from Steamworks concerns.
 *
 * @param discovery - Service used to list lobbies.
 * @param runtime - Runtime used to describe the Steam connection.
 * @param personas - Resolver used to report whether name resolution is available.
 * @param appId - App ID the server was initialised with.
 * @returns The configured router.
 */
export function createLobbyRouter(
  discovery: LobbyDiscoveryService,
  runtime: SteamGateway,
  personas: PersonaNameResolver,
  appNames: AppNameCatalogue,
  appId: number,
): Router {
  const router = Router();

  router.get('/steam', (_request: Request, response: Response) => {
    response.json(describeSteam(runtime, personas, appNames, appId));
  });

  router.get('/lobbies', async (_request: Request, response: Response) => {
    const steam = describeSteam(runtime, personas, appNames, appId);

    try {
      const lobbies = await discovery.listLobbies();
      const payload: LobbyListResponse = {
        steam,
        lobbies: lobbies.map((lobby) => lobby.toSession()),
        retrievedAt: new Date().toISOString(),
      };
      response.json(payload);
    } catch (error) {
      const message =
        error instanceof LobbyDiscoveryError
          ? error.message
          : 'Unexpected failure while reading the lobby list.';
      const payload: LobbyListError = { error: message, steam };
      response.status(503).json(payload);
    }
  });

  return router;
}

/**
 * Summarises the state of the local Steam connection.
 *
 * @param runtime - Runtime used to read connection state.
 * @param personas - Resolver used to report name resolution capability.
 * @param appNames - Catalogue used to resolve the App ID to a name.
 * @param appId - App ID the server was initialised with.
 * @returns A serialisable connection description.
 */
function describeSteam(
  runtime: SteamGateway,
  personas: PersonaNameResolver,
  appNames: AppNameCatalogue,
  appId: number,
): SteamConnectionInfo {
  const ready = runtime.isReady();
  return {
    connected: ready,
    appId,
    appName: appNames.resolve(appId),
    steamId: ready ? runtime.getCurrentSteamId() : null,
    personaName: ready ? runtime.getCurrentPersonaName() : null,
    detail: ready ? describeNameResolution(personas) : runtime.getFailureReason(),
  };
}

/**
 * Describes how host names were resolved for this session.
 *
 * @param personas - Resolver used to report name resolution capability.
 * @returns A human readable capability note.
 */
function describeNameResolution(personas: PersonaNameResolver): string {
  return personas.canResolveAnySteamId()
    ? 'Host names resolved via the Steam Web API.'
    : 'Host names resolve for friends only. Set STEAM_WEB_API_KEY to resolve any host.';
}