# Steam Lobby Browser

A proof of concept that lists the Steam lobbies advertising App ID 480 (Spacewar),
read through the Steamworks SDK over FFI.

Each lobby is reported with its application name, the Steam ID and persona name of
the host, and every key/value parameter the session advertises.

## Architecture

`steamworks-ffi-node` is a native FFI binding, so it can only run in Node — not in a
browser. The app is therefore split in two, served from one origin:

```
shared/lobby.ts        Wire contract shared by both halves

server/                Node process: owns the Steamworks SDK
  config/              Environment-driven configuration
  models/Lobby         Immutable domain entity, built from raw SDK data
  services/
    SteamGateway       Interface describing everything the app needs from Steam
    SteamRuntimeService  Production implementation; owns SDK lifecycle
    LobbyDiscoveryService  Queries and hydrates lobbies
    LobbyHostResolver   Identifies who is hosting each lobby
    PersonaNameResolver   Resolves Steam IDs to names
    PersonaName           Rejects Steam's placeholders and blanks
    AppNameCatalogue      Resolves App IDs to application names
  routes/              Express router exposing GET /api/lobbies
  main.ts              Entry point

src/                   Browser client, built by Vite
  models/              View model wrapping the wire format
  services/            Fetch client for the API
  views/               Renders the lobby list
  controllers/         Orchestrates polling and rendering

scripts/               Verification harnesses, run by `npm test`
```

In development the Express server mounts Vite as middleware, giving the client hot
module replacement without a proxy. In production it serves the pre-built `dist`
directory instead.

Every layer depends on abstractions rather than globals. `SteamGateway` is the seam
that matters most: `SteamRuntimeService` is the only file that touches the native
SDK, so lobby discovery, name resolution, and the HTTP layer can all be exercised
without Steam installed. That is what `npm test` does.

## Prerequisites

Two things must be in place before lobbies will appear.

**1. The Steam client must be running and signed in.**

**2. The Steamworks SDK redistributables must be installed.**

Valve's licensing terms forbid redistributing them, so they are not in this
repository. Download the Steamworks SDK from the
[Steamworks Partner site](https://partner.steamgames.com/), then copy the
`redistributable_bin` folder into the project root:

```
steamtest/
└── steamworks_sdk/
    └── redistributable_bin/
        └── osx/                  # linux64/, win64/ on other platforms
            └── libsteam_api.dylib
```

Games built against the SDK ship the identical binary, so if you already have one
installed this will do:

```
cp "~/Library/Application Support/Steam/steamapps/common/<game>/libsteam_api.dylib" \
   steamworks_sdk/redistributable_bin/osx/
```

The loader searches the project root and its parents. A `steam_appid.txt` is not
needed — `steamworks-ffi-node` sets the `SteamAppId` environment variable during
`init()`.

Without the SDK the server still starts and the UI shows a diagnostic, rather than
crashing.

## Running

```bash
npm install
npm run dev          # http://localhost:5173
```

| Command          | What it does                                              |
| ---------------- | --------------------------------------------------------- |
| `npm run dev`    | Server plus Vite middleware, with hot module replacement.  |
| `npm test`       | Typechecks all three projects, then runs the harnesses.    |
| `npm run build`  | Typechecks, then builds the client into `dist`.            |
| `npm start`      | Serves the built client and the API from Node.             |

The harnesses in `scripts/` cover the domain entity, name resolution, lobby
discovery against a fake ISteamMatchmaking, the HTTP contract, and the view's
rendering. None of them need Steam or the native SDK.

## Configuration

| Variable              | Default    | Purpose                                            |
| --------------------- | ---------- | -------------------------------------------------- |
| `STEAM_APP_ID`        | `480`      | App ID whose lobbies are listed.                    |
| `PORT`                | `5173`     | Port the Node server listens on.                    |
| `STEAM_MAX_LOBBIES`   | `50`       | Upper bound on lobbies requested per query.         |
| `STEAM_WEB_API_KEY`   | unset      | Enables host name resolution for non-friends.       |
| `NODE_ENV`            | unset      | Set to `production` to serve `dist` instead of Vite.|

## A note on host names

Steam's lobby API has no host field you can read. `ISteamMatchmaking::GetLobbyOwner`
returns an empty string for any lobby you are not a member of, and a lobby found
through `RequestLobbyList` is by definition one you have not joined — so the member
roster comes back empty too. About half of a real App 480 lobby list has no host
information at all.

`LobbyHostResolver` therefore works from the metadata the host chose to advertise,
in priority order:

1. `OWNINGID`, then `P2PADDR`, `OI`, `ownerSteamId_s`, and a dozen other keys seen
   in the wild. Each candidate is validated as a Steam ID64 before it is trusted.
2. `OWNINGNAME` / `OWNINGNAME_s` for the name — free and instant, no API key, and
   present in most lobbies that advertise an ID.
3. Only then a lookup, via `ISteamFriends` for friends or `GetPlayerSummaries` when
   `STEAM_WEB_API_KEY` is set.

Two details worth knowing:

- `2A` is excluded from the candidate keys. SteamNetworkingSockets documents it as
  a client port, but several games put a Steam ID there; trusting it would
  misattribute the host.
- Steam answers `GetFriendPersonaName` with the literal string `[unknown]` for
  private profiles. That is filtered out rather than shown as someone's name.

Without `STEAM_WEB_API_KEY` roughly a quarter of lobbies have a name; the rest show
their Steam ID or are marked as not advertising a host. The active mode is shown as
a footnote beneath the list.

## Scope

Deliberately limited to discovery. The SDK only ever returns lobbies for the App ID
the process initialised with, so this cannot enumerate lobbies for other games —
that is a platform restriction, not an implementation gap. Lobby metadata does not
carry a reliable App ID either, so every lobby is reported under the configured
App ID. Joining lobbies, chat, and lobby creation are out of scope.