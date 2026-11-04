# Squeek Studio

A customizable OBS overlay studio for Squeekchain streamers. Build a layout with live wheel telemetry, settled Squeek blocks, block progress and recent events. The editor runs entirely in the browser and needs no wallet, account, API key or backend.

- Existing editor: [Squeek Studio](https://squeek-studio-make-the-wheel-par.imd.site/)
- Default live output: [transparent OBS overlay](https://squeek-studio-make-the-wheel-par.imd.site/#/overlay). Use **Get overlay link** for your customized snapshot.
- Existing IMD label: `squeek-studio-make-the-wheel-par.identitymd.eth`.

This repairs the existing project. At validation time on 2026-11-04, its published IPFS version still failed with AJV's CSP EvalError. The corrected candidate passed editor and OBS checks at the same HTTPS origin with the real host CSP retained, using explicitly intercepted local candidate assets. **That check is not a publication.** IMD publishes the delivered `dist/` as the next version under the existing label after submission; unmodified replacement verification must follow that publication. See [validation](VALIDATION.md) for the exact distinction and results.

## Run locally

Use Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

To rebuild and preview the production export:

```sh
npm run typecheck
node scripts/build.mjs
npm run preview
```

`node scripts/build.mjs` generates standalone validators from the pinned schemas, bundles their custom decimal, date-time, UUID and Unicode helpers into `src/generated/validators.js`, then runs the existing Vite configuration. AJV compilation happens in Node during this step. The application imports only the generated functions: it needs neither runtime schema compilation nor `eval`, `new Function` or browser `require`. Hosting CSP is unchanged. The generator also checks the JavaScript syntax tree for executable compilation or unbundled helpers.

The existing package manifest, lockfile, TypeScript configuration and Vite configuration are preserved. `npm run build` still bundles the committed generated module; use the full build command above whenever schemas or validator formats change. `node scripts/generate-validators.mjs --check` detects stale generated source. `node scripts/typecheck.mjs` is an equivalent no-emit check that can also resolve a contributor's disposable scratch toolchain.

`dist/index.html` and all required assets are included. Serve the **contents of dist/** with any static host. Vite uses `base: './'`, assets are local, and routing uses URL fragments, so a gateway subpath works without server rewrites. Use HTTPS in production for clipboard access and browser crypto. Do not open index.html directly with a file URL.

## Use the studio

- Choose **Minimal Wheel**, **Cozy Broadcast**, or **Neon Night**. Applying a template replaces the layout and can be undone.
- Add up to 12 widgets: wheel status, wheel speed, settled blocks, block progress, recent events and custom text.
- Select a widget in the preview or widget list. Drag to position, edit X/Y, or use arrow keys on the focused canvas widget. Shift moves 10 px. Change its label, scale, opacity, background and visibility. Layer arrows change stacking order; later rows appear on top.
- Labels wrap at every supported length, including exactly 20 wide characters. Widgets grow to contain the complete label and clamp inside the canvas, reserving the bottom 32px for the source stamp. Extremely tall labels can limit the whole widget's scale. Existing version-1 presets retain their settings; label-driven bounds are normalized safely when loaded.
- The Canvas tab controls the layout name, accent, text and widget background colors, and transparent or solid canvas background. The forest scene is an original editor preview illustration and is never included in the OBS output.
- Undo and redo cover layout changes. The latest draft saves automatically in local storage. **Save preset** creates a named browser-local copy; **My presets** loads or deletes saved copies. Up to 20 presets are supported. There is no account sync.
- Export JSON for a portable backup. Import validates the version, types, colors, unique IDs, size, widget count and safe canvas bounds before changing the editor. Failed imports preserve the current layout. Maximum file size: 64 KiB; custom text: 120 characters across four explicit lines.

## Add the overlay to OBS

1. Select **Live** for real API reads, or keep **Demo** for clearly labelled simulated styling data.
2. Select **Get overlay link**, then **Copy overlay link**.
3. In OBS Sources, add a **Browser** source. Paste the entire URL, including its fragment. Set width **1280** and height **720**. Keep OBS's transparent browser-source background.
4. Put this source above the video source. For a 1920 × 1080 scene, use **Transform → Fit to screen**.

The generated URL uses `#/overlay?config=…` and contains a validated layout snapshot. It works in a separate browser profile without the editor's local storage. After changing the layout, copy a new link and replace the OBS source URL. The output has no editor controls or footer. It always identifies demo versus live data, including non-hardware provenance reported by the API. A solid canvas background is intentionally opaque.

Opening `#/overlay` without a configuration shows the Minimal Wheel layout in live mode. An invalid configuration displays an explicit error instead of silently replacing it with another layout. The deployed origin is used automatically for copied links; no domain configuration is required.

## APIs and data semantics

The adapter follows the [Squeekchain API reference](https://docs.squeekchain.com/developers/api/). All requests are read-only and use `https://api.squeekchain.com`:

| Endpoint | Poll interval | Display |
| --- | --- | --- |
| `/v1/status` | 5 seconds | ACTIVE → running, IDLE → idle; RPM from `rpmMilli / 1000`, speed from `speedMmPerSecond / 1000` in m/s |
| `/v1/core` | 15 seconds | Settled `core.blockHeight` and `core.blockProgress / 1,000,000,000 × 100` |
| `/v1/events?category=all&limit=5` | 15 seconds | Three newest returned events, with occurrence times |

The API currently serves **Sepolia**, not Ethereum mainnet. Its chain reads are 12 confirmations behind the tip. Projected builder work is never presented as settled height or progress. IDs and heights retain decimal-string/BigInt precision; only bounded fractional progress is converted to a JavaScript number.

Published draft-2020-12 schemas are pinned in `src/schemas/`, retrieved on 2026-11-04 from the API docs' [status](https://docs.squeekchain.com/assets/api/status.json), [core](https://docs.squeekchain.com/assets/api/core.json) and [events](https://docs.squeekchain.com/assets/api/events.json) schema links. This repair re-fetched all three and confirmed they are structurally unchanged. Standalone AJV functions check the complete responses, date-time/UUID formats and exact uint64/96/256 decimal bounds. Supported response versions are status **1**, core **1** and events **3**. Unsupported versions and malformed payloads explicitly say **Schema mismatch**; validated unavailable payloads say **Source unavailable** and retain the API's reason. Data is read from the service's reported deployment, with cross-endpoint installation/chain/core consistency checks only between healthy available payloads; this is a display tool, not an independent chain verifier.

ETags are revalidated. A 304 reuses validated data without treating its old `generatedAt` as new content. A 429 or 503 honors `Retry-After` (seconds or HTTP date), measured from **response receipt**, including when the request was slow; missing headers and network/other server errors use bounded exponential backoff. Requests time out after 10 seconds and cancel when their view unmounts. Each editor or OBS source polls independently.

Missing measurements, counter faults, stale telemetry, invalid responses and failed sources display **Unknown**, not zero. A fresh idle RPM of zero is valid data. Measurement timestamps and `staleAfterSeconds` govern telemetry freshness. A source not successfully checked for 45 seconds, or a safe chain frontier unchanged for 5 minutes, is conservatively marked stale. Healthy independent channels can still display their own values. The Data source disclosure explains per-endpoint health and retry delays.

**Demo mode is simulation.** It makes no API requests and never silently replaces failed live data. A persistent mode label is included in the OBS output. API telemetry whose provenance is simulated, replayed or derived is separately identified even in live-source mode.

## Validate

```sh
npm run typecheck
node scripts/build.mjs
npm test
```

These commands assume the Playwright Chromium version matching the installed dependencies is available. In IMD's provided browser runtime, validation used:

```sh
TMPDIR=/tmp IMD_PLAYWRIGHT=/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node scripts/validate.mjs
```

`npm test` starts and closes its own temporary static server under a `/preview/` subpath with the captured **production CSP**. An asynchronously loaded positive-control script proves that `new Function` actually throws EvalError. It checks standalone generation, integer/date boundaries, delayed 429/503 cooldowns, independent endpoint outages, schema mismatches, template and long-label bounds, editor interactions, downloads/imports, portable OBS links, transparency, keyboard focus, responsive overflow and an Axe accessibility audit. Browser live/failure tests use explicitly intercepted public-response fixtures in `scripts/fixtures/`; those fixtures are never used by the application. WebKit's primary flow is attempted when its runtime and system libraries are available. Scratch output is written under `test/scratch/` and is not part of the delivered app.

Validation on 2026-11-04: production build and typecheck passed; **29 interaction/data checks passed**, the pinned design probe passed **16/16**, and Axe found **zero violations** in the tested desktop/mobile/editor-dialog views. The candidate passed **four HTTPS-origin editor/live/OBS checks** with no fatal or error console messages. Real browser HTTP responses from all three API endpoints were 200 and passed their unchanged official schemas; no source outage or schema mismatch was observed in that sample. Simulated failures are separately tested. WebKit, native OBS, physical devices and verification of the replacement after IMD publication remain unverified.

To check the real published site after IMD updates it:

```sh
node scripts/check-hosted.mjs
```

It checks the existing HTTPS editor, real API reads, a copied demo OBS snapshot, and the default live OBS route. It records the actual host CSP/CID, per-endpoint HTTP/schema classification, console errors and screenshots in `test/scratch/hosted/`, and exits nonzero on failed checks. `--candidate` is an explicitly labelled pre-publication test: it substitutes `dist/` at that same origin while retaining the live document's security headers. It never publishes or claims to have verified published replacement bytes. Use the same `IMD_PLAYWRIGHT`/`PLAYWRIGHT_BROWSERS_PATH` settings as above when using IMD's provided runtime.

The share card's **Made for OBS** badge and 1200 × 630 PNG were regenerated from `public/social-card.svg` with `node scripts/render-social-card.mjs` using the same browser runtime. The renderer asserts that the complete badge text fits.

Exact commands, screenshots, fixes and remaining test limitations are recorded in [VALIDATION.md](VALIDATION.md). The implemented design system is in [DESIGN.md](DESIGN.md).

## Limitations

- API availability, schema changes and eventual indexing affect live widgets. This application does not certify wheel hardware or verify chain state independently.
- Presets and drafts are local to one browser and can be cleared by the browser. JSON is the backup/transfer mechanism. OBS links are snapshots, not synchronized editor sessions.
- The canvas uses a fixed 16:9 coordinate system. Preview scaling helps on phones; precise layout work is easier in the large preview or on a larger screen. Custom colors, opacity and background-free widgets can reduce contrast against a stream's actual video.
- Native OBS rendering, physical phones, native browser zoom, screen-reader sessions and unavailable browser runtimes require additional checks. See the validation report for the exact coverage of this delivery.
- The existing published version remains in service until IMD accepts and publishes this replacement. A successful candidate test cannot establish that the public replacement has been published.

## Original project provenance

This continues original job `37050fa6-0c34-40ce-8e48-8be4cc20a874`, opened 2026-11-04, delivered to [identity-md-launches/launch-2953-build-publish-complete-web](https://github.com/identity-md-launches/launch-2953-build-publish-complete-web), original commit `c8ae90d0c232ba7909a162611fa1c1ea2b839a32`, [original PR #1](https://github.com/identity-md-launches/launch-2953-build-publish-complete-web/pull/1). The existing label above and its pre-repair version `ipfs://bafybeidjev2avzhp2hy42wrz6uk55s5hcmj7jo57q7kxs6shv3w7z7ks6e` came from the supplied project handoff. The editor's **Developed by @sina_133** footer attribution and original mark, templates and preview artwork are retained.

Font and design-guidance notices are retained in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
