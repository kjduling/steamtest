import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express, { type Express } from 'express';

import type { AppConfig } from './config/AppConfig';
import { AppNameCatalogue } from './services/AppNameCatalogue';
import { LobbyDiscoveryService } from './services/LobbyDiscoveryService';
import { PersonaNameResolver } from './services/PersonaNameResolver';
import { SteamRuntimeService } from './services/SteamRuntimeService';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDirectory, '..');

/**
 * Wires up the HTTP layer for the lobby browser.
 *
 * In development Vite is mounted as middleware so the client gets hot module
 * replacement from the same origin as the API. In production the pre-built client
 * in `dist` is served instead.
 *
 * @param config - Runtime configuration.
 * @returns The configured Express application.
 */
export async function createServer(config: AppConfig): Promise<Express> {
  const app = express();

  const runtime = SteamRuntimeService.getInstance();
  const personas = new PersonaNameResolver(config.steamWebApiKey);
  const appNames = new AppNameCatalogue();
  const discovery = new LobbyDiscoveryService(
    runtime,
    appNames,
    personas,
    config.appId,
    config.maxLobbies,
  );

  const { createLobbyRouter } = await import('./routes/lobbyRoutes');
  app.use('/api', createLobbyRouter(discovery, runtime, personas, appNames, config.appId));

  if (config.isProduction) {
    app.use(express.static(path.join(projectRoot, 'dist')));
  } else {
    const { createServer: createViteServer } = await import('vite');
    const viteServer = await createViteServer({
      root: projectRoot,
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(viteServer.middlewares);
  }

  return app;
}

/**
 * Reports whether the Steamworks SDK came up.
 *
 * Failure is logged rather than fatal: the server still starts and serves a
 * diagnostic page so the problem is visible in the browser.
 *
 * @param runtime - The Steamworks runtime.
 * @param config - Runtime configuration.
 */
export function initialiseSteam(runtime: SteamRuntimeService, config: AppConfig): void {
  const started = runtime.start(config.appId);

  if (started) {
    const steamId = runtime.getCurrentSteamId();
    const personaName = runtime.getCurrentPersonaName();
    console.log(
      `[steam] initialised for App ID ${config.appId} as ${personaName ?? 'unknown'} (${steamId ?? 'no id'})`,
    );
    return;
  }

  console.warn(`[steam] unavailable: ${runtime.getFailureReason() ?? 'unknown reason'}`);
  console.warn('[steam] the UI will list lobbies only once the SDK initialises; press refresh to retry.');
}