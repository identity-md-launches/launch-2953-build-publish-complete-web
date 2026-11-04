# Squeek Studio repair validation

Date: 2026-11-04. This is the contributor's own validation record, not an independent certification.

## Result and publication boundary

The repaired source and production export pass the build, typecheck, **29 interaction/data checks**, the **16/16** pinned design checks and four candidate checks at the existing HTTPS origin. The candidate editor and both OBS variants rendered with **no page errors or error console messages**, under the actual host CSP. All five requested critic fixes are implemented.

**Verification of the published replacement remains incomplete.** The unmodified public site still served the original CID during the final check and failed with AJV's EvalError in both editor and OBS documents. IMD publishes the submitted export after review under the same existing label. No replacement publication or successful unmodified replacement check is claimed here. `scripts/check-hosted.mjs` is the repeatable post-publication check.

| Surface | Address / identity | Observed result |
| --- | --- | --- |
| Existing editor | https://squeek-studio-make-the-wheel-par.imd.site/ | Original published version reproduced the fatal CSP error; candidate passed |
| Default live OBS output | https://squeek-studio-make-the-wheel-par.imd.site/#/overlay | Original published version reproduced the fatal CSP error; candidate rendered transparently with real API data |
| Existing IMD label | `squeek-studio-make-the-wheel-par.identitymd.eth` | Preserved |
| Published CID at validation | `bafybeidjev2avzhp2hy42wrz6uk55s5hcmj7jo57q7kxs6shv3w7z7ks6e` | The original version, not this candidate |

Original project/job provenance is retained in README.md. The original templates, illustration, wheel mark, local preset keys and `Developed by @sina_133` footer remain.

## Reproduced problems and repairs

Priorities below describe this review's impact assessment; the original finding IDs were not supplied.

| Priority / problem | Source and correction | Recheck |
| --- | --- | --- |
| High: startup executes AJV's runtime compiler, producing a blank page under IMD CSP | `src/api.ts:2` imports generated functions. `scripts/generate-validators.mjs:8` generates standalone AJV functions during the Node build and bundles decimal/date-time/UUID/Unicode helpers. `scripts/check-runtime.mjs` parses the generated module and production JavaScript for executable eval, Function or require calls. Compiler settings and pinned schemas remain intact. | Reproducible generation; strict-CSP editor and OBS startup; real-origin candidate editor, demo OBS and live OBS all passed. An asynchronously loaded control script proves that Function compilation is blocked with EvalError. |
| High: short wide labels, including exactly 20 W characters, escape the widget and canvas | `src/components/Canvas.tsx:38`, `src/styles.css:729`, `src/label-layout.ts`, `src/model.ts:163`. Every label has a shrinkable wrapping span. Deterministic line estimates reserve label and adornment space; widget height grows, bounds round inward, and exceptionally tall widgets cap their scale. Templates use the same clamp. Existing version-1 presets normalize the new bounds without losing other settings. | Every template fits; all six widget types tested with 20/36 W, spaced words, 36 CJK characters and 36 explicit newlines at 50/100/160% scale. Max-length custom body text also fits. UI edits at the right/bottom edge and an isolated 20-W OBS case passed. Intentional overlap between user-positioned layers remains possible. |
| Medium: delayed responses consume the Retry-After cooldown | `src/api.ts:160` records response receipt and uses it for Retry-After, successful check timestamps and error backoff. | Simulated 8-second response delay plus 3-second cooldown cannot retry before second 11. Both 429 and 503, seconds, HTTP dates, missing/invalid headers, ETag and 304 cases passed without real-time waits. |
| Medium: unavailable core metadata falsely suppresses healthy independent events | `src/api.ts:295` gates cross-source comparisons on healthy available payloads. Events retain their own availability; actual available deployment mismatches are still rejected. | HTTP-200 unavailable core with a different installation ID retains healthy wheel/events. Failed, loading, stale and rate-limited core cases passed. The rendered editor distinguishes unavailable core, unavailable events and malformed schema responses. |
| Medium: editor heading does not name the task | `src/App.tsx:532`: **Customize your OBS overlay** | Visible on the 390px first screen with the working preview and Get overlay link action. |
| Medium: share badge exceeds its background | `public/social-card.svg:8`: **Made for OBS**. `scripts/render-social-card.mjs` renders the corrected SVG and asserts badge bounds before writing the PNG. | Inspected the regenerated 1200 × 630 PNG; complete badge fits. Exported PNG/SVG match their public sources. |
| Low: long custom body text uses tight multiline leading | `src/styles.css`, `.custom-text.long-text`: 1.4 line height within the existing 20px type step. | Maximum 120-character/four-line body stress case remains inside its widget across the label/scale cases above. |

## Production build and interaction verification

The root package manifest, lockfile, TypeScript/Vite configuration and ignore file are unchanged. Dependencies were installed from the existing lockfile into disposable scratch storage; the build/typecheck helpers only supply dependency resolution when that storage is used. No dependency directories or caches are deliverables.

| Command | Actual result |
| --- | --- |
| `node scripts/build.mjs` | Exit 0. Standalone validator module: 337,093 bytes. Vite production export generated with relative asset URLs. Main JS 588.15 kB; CSS 32.03 kB. Vite reported a nonblocking chunk-size warning. |
| `node scripts/typecheck.mjs` | Exit 0, project TypeScript configuration, strict/no emit |
| `TMPDIR=/tmp IMD_PLAYWRIGHT=/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node scripts/validate.mjs` | Exit 0; 29 checks passed; WebKit unavailable and explicitly unverified |
| Same browser settings, `node scripts/render-social-card.mjs` | Exit 0; regenerated PNG from corrected SVG; badge bounds assertion passed |
| Same browser settings, `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Exit 0; 16/16 checks passed on the final export |
| Same browser settings, `node scripts/check-hosted.mjs --candidate` | Exit 0; four HTTPS-origin editor/live/demo-OBS/live-OBS checks passed |
| Same browser settings, `node scripts/check-hosted.mjs` | Exit 1 as expected for the still-published original version: editor and OBS startup blocked by runtime compilation |

The primary suite serves `dist/` under `/preview/` with the exact captured host CSP from `scripts/fixtures/hosting-csp.txt`. It validates source generation and custom formats, imports/exports and corrupt input recovery, Unicode URLs, all templates, add/remove/reorder/drag/keyboard placement, scale/visibility edits and opacity validation, undo/redo, canvas settings, draft reloads, save/load/delete presets, focus trapping/restoration, clipboard and portable links, true transparency and absent OBS chrome, demo/live separation, healthy and failed API states, and reduced motion.

Responsive layouts were exercised at 320, 390, 760, 1024 and 1440 CSS pixels. The primary action remained in the viewport and no document horizontal overflow occurred. Axe found zero violations in the tested desktop, mobile and OBS-dialog editor states; this is not a full accessibility certification.

The retained 1280 × 720 PNGs were also decoded in Chromium and their alpha channels scanned: the live OBS image has 834,450 fully transparent pixels out of 921,600; the isolated right-edge label image has 870,353. Both span alpha 0–255. This confirms raster transparency as well as the three transparent computed backgrounds; it is a browser-output check, with native OBS still unverified.

## HTTPS host and live API investigation

`scripts/check-hosted.mjs` opens the actual HTTPS site. Without flags it uses the unmodified published responses. With `--candidate`, it fetches the real host document and retains its response/security headers while explicitly substituting this repository's `dist/` document/assets at that same origin. API requests remain real. This verifies candidate behavior under the host's real origin and CSP; **it does not verify that IMD has published these bytes**. Both modes, their timestamps, the host CSP/CID, endpoint results and console summaries are retained in [reports/checks.json](reports/checks.json).

The host's existing script policy is `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`; it excludes JavaScript `unsafe-eval`. No CSP directive was weakened or bypassed. The original published documents produced the expected EvalError; the candidate documents had no fatal or error console messages.

The [official API reference](https://docs.squeekchain.com/developers/api/) was read, and its linked [status](https://docs.squeekchain.com/assets/api/status.json), [core](https://docs.squeekchain.com/assets/api/core.json) and [events](https://docs.squeekchain.com/assets/api/events.json) schemas were re-fetched. All three are structurally identical to the pinned schemas. Their source hashes are retained in the JSON record.

| Real endpoint | Version | Final browser sample | Interpretation |
| --- | --- | --- | --- |
| [Status](https://api.squeekchain.com/v1/status) | 1 | HTTP 200; complete payload passed its schema | Healthy response, not a schema mismatch |
| [Core](https://api.squeekchain.com/v1/core) | 1 | HTTP 200; available payload passed its schema | Healthy settled source |
| [Events](https://api.squeekchain.com/v1/events?category=all&limit=5) | 3 | HTTP 200; available payload passed its schema | Healthy independent event source |

No API outage or schema mismatch occurred in the successful live samples; this does not establish uninterrupted service availability. The published blank page is a client startup failure. In simulated regressions, valid unavailable payloads produce **Source unavailable: indexer_unavailable**, malformed payloads produce **Schema mismatch**, and 429/503 responses produce rate-limit/outage retry messages. Unknown values stay unknown; they never become demo data or zero.

## Better Interface review: six domains

The pinned workflow, core principles of all six domains and document-web-design guide were applied while repairing the existing interface. The visual idea remains the original warm charcoal broadcast editor with an amber wheel mark, cream type and mint status cues. No unrelated visual redesign was introduced.

| Domain | Coverage and evidence | Limits |
| --- | --- | --- |
| Accessibility | Checked native controls, labels, named icon actions, keyboard widget movement, modal Tab/Escape and focus return, visible primary-action focus ring, reduced motion and automated Axe states. The Shift-Tab handler was reviewed in source. | No rendered Shift-Tab check, screen-reader session, physical-device check or full keyboard-only traversal of every control; custom colors cannot inherit the default audit. |
| Layout | Checked first screen at 390, reflow at 320 and intermediate widths, default-template safe areas and extreme content bounds. Screenshots inspected. Fixed overlay coordinates are intentional physical geometry. | Native 200% browser zoom and RTL mirroring not verified. User-controlled layer overlap is intentionally allowed. |
| Writing | Checked task heading, action names and recovery messages. Restored source/schema distinction and preserved explicit Demo/Live labels and original attribution. | English interface only; no localization claims. |
| Typography | Checked loaded local DM Sans, six sizes and three weights, natural casing/tracking, tabular metrics, complete wrapping, long custom text and the share badge. Removed the label-length threshold. | Other native font/rendering engines unverified. |
| Colors | Preserved the existing semantic palette. Probe passed measured solid-background text at 4.5:1/3:1 as applicable; statuses also carry text. | Probe excluded 46 text boxes over imagery/canvas/gradients. Arbitrary stream footage, custom colors and opacity remain unverified. No fabricated contrast ratio is reported. |
| UI | Checked templates, selectors, fields, switches, dialogs, notifications, primary action, empty/error/retry states and source disclosure. Motion uses existing reduced-motion guards; no endless animation remained. | No manual slow-motion animation-panel audit or native OBS session. |

The probe also confirmed no clipped text, horizontal overflow, detected overlaps, floating controls over text, kicker labels, extra font families, repeated copy, stacked surfaces or missing share metadata in its entry-page scope. Twenty controls were below the comfortable 44px target, but all measured controls met the 24px/spacing baseline. Product and primary action are visible at 390px; first-screen prose was 24 words. Probe results do not cover every possible imported layout or user-selected color.

## Retained evidence and remaining limits

- [Candidate editor, 390px](reports/screenshots/editor-390.png): actual host origin/CSP, substituted candidate bytes.
- [Candidate editor, desktop](reports/screenshots/editor-1440.png): default studio and retained attribution.
- [Candidate live OBS](reports/screenshots/overlay-live.png): real API sample, transparent output without editor chrome.
- [20-W right-edge label](reports/screenshots/long-label-right-edge.png): isolated speed widget in the local production-CSP OBS test, with complete label visible.
- [Keyboard focus](reports/screenshots/keyboard-focus.png): tested primary-action focus state.
- [Structured check record](reports/checks.json): successful checks, probe results, public endpoint/schema records and the explicit failed published baseline.

The final source design tokens, type roles, components, wrapping rules and responsive behavior are documented in DESIGN.md. README.md documents installation, preview, full rebuild and post-publication checks.

Remaining limits: IMD replacement publication and its unmodified hosted recheck are pending; WebKit, native OBS, physical devices, native zoom, RTL, assistive-technology sessions and arbitrary custom overlays are unverified. The corrected source/export and candidate checks are complete; the full request's published-replacement verification cannot be marked complete before IMD publishes it.

## Submission integrity

The added/modified submission is below 2 MiB, within the 8 MiB cap. The Git-visible complete tree is approximately 2.17 MB including the static export, generated source, runtime licenses, documentation and five retained screenshots. Protected package/configuration/dependency paths and the ignore file are unchanged. No dependency/cache directories, archives or submodules are included. Required generated source and `dist/index.html` are eligible for the worker's normal Git collection; all referenced relative export assets exist. `git diff --check` passed, and exported public assets match their source bytes. Only the worker performs staging/commit after this task.
