import { AppConfig } from './config/AppConfig';
import { initialiseSteam, createServer } from './SteamLobbyServer';
import { SteamRuntimeService } from './services/SteamRuntimeService';

/**
 * Entry point for the Steam lobby browser.
 *
 * Boots the HTTP layer, initialises the Steamworks SDK, and arranges for a clean
 * shutdown so the native library is never left dangling.
 *
 * @returns Resolves once the server is listening.
 */
async function main(): Promise<void> {
  const config = new AppConfig();
  const runtime = SteamRuntimeService.getInstance();

  const app = await createServer(config);
  const server = app.listen(config.port, () => {
    console.log(`[server] listening on http://localhost:${config.port}`);
  });

  // Initialise after listening so the port is claimed even when Steam is unavailable.
  initialiseSteam(runtime, config);

  const shutdown = (signal: NodeJS.Signals): void => {
    console.log(`[server] ${signal} received, shutting down`);
    runtime.stop();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error('[server] failed to start:', error);
  process.exit(1);
});