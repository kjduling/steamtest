import './styles.css';

import { LobbyBrowserController } from './controllers/LobbyBrowserController';
import { LobbyApiClient } from './services/LobbyApiClient';

/**
 * Looks up a required element and throws if the markup is missing.
 *
 * Keeping the assertion in one place means a malformed `index.html` fails loudly at
 * start-up rather than silently rendering nothing.
 *
 * @param selector - A CSS selector.
 * @returns The matched element.
 * @throws {Error} When no element matches.
 */
function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

const controller = new LobbyBrowserController(new LobbyApiClient(), {
  refreshButton: requireElement<HTMLButtonElement>('#refresh'),
  listContainer: requireElement('#lobbies'),
  statusBar: requireElement('#status'),
  noticeBar: requireElement('#notice'),
  detailBar: requireElement('#detail'),
});

controller.start();