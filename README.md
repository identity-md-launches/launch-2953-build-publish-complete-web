# Squeek Studio

A customizable OBS overlay studio for Squeekchain streamers. Build a layout with live wheel telemetry, settled Squeek blocks, block progress and recent events. The editor runs entirely in the browser and needs no wallet, account, API key or backend.

## Run locally

Use Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

To rebuild and preview the production export:

```sh
npm run typecheck
npm run build
npm run preview
```

`dist/index.html` and all required assets are included. Serve the **contents of dist/** with any static host. Vite uses `base: './'`, assets are local, and routing uses URL fragments, so a gateway subpath works without server rewrites. Use HTTPS in production for clipboard access and browser crypto. Do not open index.html directly with a file URL.

## Use the studio

- Choose **Minimal Wheel**, **Cozy Broadcast**, or **Neon Night**. Applying a template replaces the layout and can be undone.
- Add up to 12 widgets: wheel status, wheel speed, settled blocks, block progress, recent events and custom text.
- Select a widget in the preview or widget list. Drag to position, edit X/Y, or use arrow keys on the focused canvas widget. Shift moves 10 px. Change its label, scale, opacity, background and visibility. Layer arrows change stacking order; later rows appear on top.
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

Published draft-2020-12 schemas are pinned in `src/schemas/`, retrieved on 2026-11-04 from the API docs' [status](https://docs.squeekchain.com/assets/api/status.json), [core](https://docs.squeekchain.com/assets/api/core.json) and [events](https://docs.squeekchain.com/assets/api/events.json) schema links. Ajv checks the complete responses, date/time/UUID formats and unsigned decimal integer bounds. Supported response versions are status **1**, core **1** and events **3**. Unsupported versions and malformed payloads become visible errors. Data is read from the service's reported deployment, with cross-endpoint installation/chain/core consistency checks; this is a display tool, not an independent chain verifier.

ETags are revalidated. A 304 reuses validated data without treating its old `generatedAt` as new content. A 429 or 503 honors `Retry-After` (seconds or HTTP date); missing headers and network/other server errors use bounded exponential backoff. Requests time out after 10 seconds and cancel when their view unmounts. Each editor or OBS source polls independently.

Missing measurements, counter faults, stale telemetry, invalid responses and failed sources display **Unknown**, not zero. A fresh idle RPM of zero is valid data. Measurement timestamps and `staleAfterSeconds` govern telemetry freshness. A source not successfully checked for 45 seconds, or a safe chain frontier unchanged for 5 minutes, is conservatively marked stale. Healthy independent channels can still display their own values. The Data source disclosure explains per-endpoint health and retry delays.

**Demo mode is simulation.** It makes no API requests and never silently replaces failed live data. A persistent mode label is included in the OBS output. API telemetry whose provenance is simulated, replayed or derived is separately identified even in live-source mode.

## Validate

```sh
npm run typecheck
npm run build
npx playwright install chromium-headless-shell
npm test
```

`npm test` starts and closes its own temporary static server under a `/preview/` subpath. It checks schema parsing and failure semantics, editor interactions, downloads/imports, portable OBS links, transparency, keyboard focus, responsive overflow and an Axe accessibility audit. Browser live/failure tests use explicitly intercepted public-response fixtures in `scripts/fixtures/`; those fixtures are never used by the application. WebKit's primary flow is attempted when its runtime and system libraries are available. Scratch output is written under `test/scratch/` and is not part of the delivered app.

Validation on 2026-11-04: production build and typecheck passed; **21 interaction/data checks passed**, the pinned design probe passed **16/16**, and Axe found **zero violations** in the tested desktop/mobile/editor-dialog views. Real HTTP responses from all three API endpoints passed their published schemas. WebKit could not run because system libraries are missing; direct browser-to-API reads on this machine returned network errors. Native OBS and physical-device behavior remain unverified.

Exact commands, screenshots, fixes and remaining test limitations are recorded in [artifacts/validation.md](artifacts/validation.md). The implemented design system is in [DESIGN.md](DESIGN.md).

## Limitations

- API availability, schema changes and eventual indexing affect live widgets. This application does not certify wheel hardware or verify chain state independently.
- Presets and drafts are local to one browser and can be cleared by the browser. JSON is the backup/transfer mechanism. OBS links are snapshots, not synchronized editor sessions.
- The canvas uses a fixed 16:9 coordinate system. Preview scaling helps on phones; precise layout work is easier in the large preview or on a larger screen. Custom colors, opacity and background-free widgets can reduce contrast against a stream's actual video.
- Native OBS rendering, physical phones, native browser zoom, screen-reader sessions and unavailable browser runtimes require additional checks. See the validation report for the exact coverage of this delivery.
- Public repository and hosting URLs are assigned by the delivery/publishing system after submission. This export does not contain a guessed public address or an external deployment dependency.

Font and design-guidance notices are retained in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
