/**
 * Resolves Steam App IDs to human readable application names.
 *
 * Spacewar (480) is handled locally because it is the app under inspection. Other
 * titles fall back to the numeric ID, which is the honest answer when the Steamworks
 * native API has no app-name accessor available.
 */
export class AppNameCatalogue {
  /** Locally known App IDs, keyed by numeric ID. */
  private static readonly knownApps: ReadonlyMap<number, string> = new Map([
    [480, 'Spacewar'],
  ]);

  /**
   * Looks up the display name for a Steam App ID.
   *
   * @param appId - The Steam App ID to resolve.
   * @returns The application name, or a generated fallback such as `App 1234`.
   */
  public resolve(appId: number): string {
    return AppNameCatalogue.knownApps.get(appId) ?? `App ${appId}`;
  }
}