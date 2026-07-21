# Blinks — bobby links

One-tap link saver for Safari (Mac + iPhone). Tap the toolbar icon, tag the
page (existing tags or new comma-separated ones), hit **Save**. A second
button opens archive.org + archive.ph in background tabs so the page is
archived.

Links are stored on the blog (`bobbby.online`) via a tiny token-authed API.

- Plain HTML/JS/CSS, manifest v3, no build step, no dependencies
- Tag chips driven by your existing tags (with counts); re-saving a URL merges tags
- One codebase ships to both macOS and iOS Safari via Apple's
  `safari-web-extension-converter`

## Layout

- `extension/` — the Safari Web Extension (manifest v3, plain HTML/JS/CSS, no build step)
- `make-app.sh` — wraps `extension/` in an Xcode project with **both** macOS and iOS app targets
- `sync-ext.sh` — regenerates config, syncs `extension/` into the Xcode project, rebuilds + reinstalls the Mac app
- `app/` — generated Xcode project (created by `make-app.sh`, not edited by hand)

The backend lives in the blog repo (`../blog`):

- `POST /api/blinks` `{url, title, tags: []}` — saves; re-saving the same URL merges tags
- `GET /api/blinks?q=&tag=` — list/search saved links
- `GET /api/blinks/tags` — all tags with counts (drives the chips in the popup)

Auth: `x-blinks-token` header (or `Authorization: Bearer`). Token is
`dev-blinks-token` in dev; set `BLINKS_API_TOKEN` in the blog's prod env.

## Building the apps (one-time setup)

Safari extensions must ship inside an app, so you need full Xcode once:

1. Install **Xcode** from the App Store, then `sudo xcode-select -s /Applications/Xcode.app`
2. `./make-app.sh` — generates `app/Blinks/Blinks.xcodeproj` with macOS + iOS targets
3. Open the project in Xcode and set your personal team under
   *Signing & Capabilities* for all targets (a free Apple ID works)

### Mac

1. Select the **Blinks (macOS)** scheme, hit Run once (installs the extension host app)
2. Safari → Settings → Developer → enable **Allow unsigned extensions** (needed for local dev builds; re-enable after each Safari restart)
3. Safari → Settings → Extensions → enable **Blinks**, allow it on `bobbby.online` (and every site, so it can read the current tab's URL)

### iPhone

1. Plug in the phone, select the **Blinks (iOS)** scheme + your phone, hit Run
   (enable Developer Mode on the phone if prompted: Settings → Privacy & Security → Developer Mode)
2. On the phone: Settings → Apps → Safari → Extensions → **Blinks** → enable, and set *All Websites* to **Allow**
3. In Safari, tap the puzzle/extension button by the URL bar → Manage Extensions once; then Blinks sits one tap away in that menu on every page. Pin it/show in toolbar if offered.

Note: free-Apple-ID builds expire after 7 days — re-run from Xcode, or use a
paid developer account / TestFlight for a permanent install.

## Config / token

No manual token entry: `extension/config.js` (gitignored) bakes the server URL
and API token into the build. Copy `extension/config.example.js` to
`extension/config.js` and fill in your server + token, or run `./sync-ext.sh`
to generate it from `BLINKS_API_TOKEN` in `../blog/.env`. The sync script also
copies `extension/` into the Xcode project, rebuilds the macOS app, and
reinstalls it to `/Applications` — run it after any extension change.
Overrides: `BLINKS_SERVER` / `BLINKS_API_TOKEN` env vars (e.g. point at
`http://localhost:4000` for testing).

The gear panel in the popup still exists as a runtime override (values stored
there beat config.js), but you shouldn't need it.

## Regenerating icons

`python3 extension/gen_icons.py` (pure stdlib, writes `extension/icons/`).
