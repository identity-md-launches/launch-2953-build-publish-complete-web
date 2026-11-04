# Squeek Studio design system

## Overview

Squeek Studio is a browser-based broadcast tool for Squeekchain streamers. Its final interface uses warm charcoal/olive surfaces, cream typography, an amber primary action and mint data-status indicators. An original hamster-wheel broadcast mark ties the editor, favicon and social card together. The original forest illustration is a preview backdrop, while the actual OBS output follows the user's transparent or solid canvas setting.

The editor prioritizes the working preview and overlay-link action. Templates and layers sit alongside it on wide screens; phone layouts retain the preview and expose Templates, Widgets and Style panels below it. This is an editor, with compact controls and short practical instructions rather than a separate marketing hero.

The editor's task heading is **Customize your OBS overlay**. The original social-card composition remains, with the corrected **Made for OBS** badge; its 1200 × 630 PNG is rendered directly from `public/social-card.svg`. The existing IMD site label and original footer attribution remain part of this project.

## Colors

The canonical definitions are CSS custom properties in `src/styles.css`. Components use semantic tokens; palette primitives feed those roles.

| Semantic token | Primitive / value | Purpose |
| --- | --- | --- |
| `--color-bg` | `--olive-950`, `#121411` | Page and recessed inputs |
| `--color-surface` | `--olive-900`, `#191c18` | Inspector, dialogs, template rows |
| `--color-control` | `--olive-850`, `#1e221d` | Secondary buttons, segmented controls |
| `--color-hover` | `--olive-800`, `#272b24` | Hover and selected neutral rows |
| `--color-border` | `--olive-700`, `#363b32` | Structural dividers and control boundaries |
| `--color-text` | `--cream-100`, `#f5f0e6` | Primary cream text |
| `--color-secondary` | `--cream-400`, `#b5b7aa` | Secondary copy and utilities |
| `--color-muted` | `--cream-500`, `#a1a595` | Helper copy and dimensions |
| `--color-accent` | `--amber-400`, `#f2c078` | Primary action, selected states, focus context |
| `--color-accent-hover` | `--amber-200`, `#ffdaa3` | Primary hover |
| `--color-status` | `--mint-400`, `#a6dfc0` | Healthy source and hardware indicators |
| `--color-error` | `--rose-400`, `#eea7a3` | Errors and removal actions |
| `--color-focus` | `--cream-100`, `#f5f0e6` | 2px keyboard perimeter with 3px offset |

The preview mat is `#20251e`; the selected template uses `#29271f` and an amber-toned `#76603d` structural border. These are local surfaces, not new global themes. All data states include text; color alone never identifies live, demo, idle, unknown or failed data.

`Canvas` sets `--overlay-accent`, `--overlay-text` and `--overlay-panel` from the validated configuration. Cozy and Minimal default to amber `#f2c078`, cream `#f5f0e6` and panel `#1b211b`. Neon defaults to lilac `#c5afff` and panel `#191527`, with a thin accent outline. These overlay choices do not change the editor palette. The source-mode stamp retains an opaque dark background and readable default status colors.

The final validation report contains rendered contrast measurements and coverage. Arbitrary custom colors, opacity and transparent text over a stream require checking against that stream; they cannot inherit the default palette's audit result.

## Typography

One locally bundled variable family, **DM Sans**, is declared in `src/styles.css` and loaded from `public/fonts/dm-sans-latin.woff2`, with a generic sans-serif fallback. The shipped interface uses weights **400, 500 and 600**. The font license is in `public/fonts/OFL.txt`. The root applies font smoothing and a 1.5 line height.

| Token | Size | Role |
| --- | --- | --- |
| `--text-xs` | 12px | Compact labels, helpers, source status, footer |
| `--text-sm` | 14px | Editor body, controls, section headings |
| `--text-base` | 16px | Mobile text inputs, event rows, long block values |
| `--text-lg` | 20px | Brand, modal headings, mobile page heading, overlay labels |
| `--text-heading` | 28px | Desktop page heading, wheel status, custom overlay text |
| `--text-display` | 40px | Overlay numeric metrics |

Headings use weight 600 and approximately 1.2 line height; the main heading has −0.035em tracking on desktop and −0.025em on phones. Body text keeps natural spacing. Overlay values use tabular numbers, and block heights retain BigInt precision. Longer heights step down to 28px or 16px and remain fully readable. Widget labels keep their 20px size and 1.4 line height at every supported length; the custom-text label uses 14px and 1.4. Longer custom body text uses the 20px step and 1.4 line height; short two-line custom body text retains 28px and 1.3. No extra type scale is introduced for these states.

Every label uses `.widget-label-text` in `src/components/Canvas.tsx` and `src/styles.css`: an explicit shrinkable span with `min-width: 0`, `overflow-wrap: anywhere` and preserved newlines. Icons and progress values do not shrink. There is no character-count cutoff or ellipsis. `src/label-layout.ts` supplies conservative wrapping estimates from the bundled face's ASCII advances, with a non-ASCII guard. `widgetSize()` in `src/model.ts` reserves icon/progress space, full label height and an 8px content allowance. Thus the 20-W boundary case is handled by the same path as shorter, longer, spaced and multiline labels.

Phone text inputs and textareas use 16px to avoid automatic iOS field zoom. Long custom text wraps with `overflow-wrap: anywhere`; four explicit lines and 120 characters are supported. Read-only overlay URLs use the native input's full selectable value, with ellipsis only in the unfocused viewport.

## Layout

Shared styles are in `src/styles.css`; `src/App.tsx` owns the editor arrangement. The main maximum width is 1800px. Spacing predominantly uses 4/8/12/16/20/24/28/32/40px steps, with larger gaps between groups than between related controls.

- Above 1230px: 40px page gutters and a three-column workspace, `250px minmax(0, 1fr) 256px`, with 24px gaps. At 1600px and above, side columns become 270px/280px and gaps 28px.
- At 1230px and below: 24px gutters and a `224px minmax(0, 1fr)` arrangement. The inspector moves below the preview and its fields form two columns.
- At 760px and below: 16px gutters, preview first, followed by the mode control and panel navigation. One editor panel is visible at a time. Inspector fields become one column, with larger input and switch targets. Header utilities collapse to icons while the overlay-link label remains visible.
- At 350px and below: 12px gutters and a smaller brand mark. The save control remains available alongside the page heading.

`Canvas` in `src/components/Canvas.tsx` uses a **1280 × 720** coordinate system. A ResizeObserver scales the complete scene into a 16:9 viewport. Widget coordinates are physical canvas coordinates; the rest of the UI uses logical spacing properties where directional. Templates, position, label and scale changes use `clampWidget()` in `src/model.ts`, reserving 32px at the bottom for the data-mode stamp. Bounds round inward to prevent fractional-pixel overflow. Exceptionally tall labels limit the complete widget's scale to fit. Existing version-1 preset settings are retained while new label-driven bounds normalize safely on import/load. Later widgets stack above earlier ones. The editor's buttons and OBS divs share the same dimensions and flex-column renderer. All default templates were checked in the editor and OBS; all six widget types were stressed in the editor, and the right-edge 20-W speed label was rechecked in an isolated OBS view. The canvas alone clips the composition at its physical boundaries; labels themselves wrap without clipping and editor copy stays in normal document flow.

The final export was exercised at 320, 390, 760, 1024 and 1440 CSS pixels. The default 390px first screen shows the product, preview, mode selector and overlay-link action. Native browser zoom, RTL mirroring and physical-device behavior remain separate unperformed checks documented in validation.

## Elevation & Depth

Surfaces are deliberately flat. Tonal layers and structural borders distinguish page, controls and inspector; cards do not combine drop shadows with borders. Dialogs use the browser's modal top layer, an opaque surface and a `#080d09c9` backdrop with 5px blur. Canvas widget order starts at z-index 1; guides use 20 and the source stamp 30. The skip link uses 100 only while focused.

Selected canvas widgets use an offset amber outline and a small corner marker. These are editing affordances and never appear in the OBS route. Neon widget outlines are part of that template's broadcast styling.

## Shapes

Buttons use 7px radii, inputs/compact utilities 5px, template rows 8px, the inspector/preview mat 10px, and dialogs/overlay panels 14px. Inner thumbnails use 4px radii. Status dots, template checks and color swatches are circles. Switch tracks are 32 × 18px with a 12px knob; mobile hit targets are larger than the visible track.

## Components

| Component or pattern | Source | Use and behavior |
| --- | --- | --- |
| `BrandMark`, `Icon` | `src/components/Icons.tsx` | Original wheel mark and one SVG icon set. Decorative SVGs are hidden from assistive technology; icons use currentColor. |
| `.button`, `.icon-button`, `.small-button` | `src/styles.css`, `src/App.tsx` | Amber primary, neutral secondary, quiet utilities, disabled states and explicit accessible names for icon controls. One primary emphasis in each surface. |
| `Modal` | `src/components/Modal.tsx` | Native dialog, named heading, inert page, Escape/backdrop close, Tab/Shift+Tab cycling and focus restoration. Save, presets, widget picker, OBS setup and large preview share it. |
| `Toggle`, `ColorField` | `src/App.tsx` | Native labelled checkbox switches and color inputs. State and hex values remain explicit. |
| `Canvas`, `WidgetContent` | `src/components/Canvas.tsx` | Shared render path for editor and OBS. Editable widgets are named native buttons with pointer drag and arrow-key positioning; OBS widgets are plain elements with no editor interactions. Complete labels wrap in a shrinkable span with label-aware dimensions from `src/model.ts` and `src/label-layout.ts`. |
| `MiniTemplate` | `src/components/Canvas.tsx` | Small original landscape compositions identifying the three template choices. Selected state includes a check and aria-pressed. |
| `DataStatus`, `Sources` | `src/components/Canvas.tsx`, `src/App.tsx` | Explicit demo/live/loading/attention status, per-endpoint health and automatic retry explanation. A native details element provides disclosure. Schema mismatches, validated source outages and rate limits have different messages; unavailable core metadata cannot suppress healthy independent events. |
| `.field`, `.range-field`, `.position-inputs` | `src/styles.css`, `src/App.tsx` | Labelled text, select, numeric and range controls. The custom text helper is a description, not part of the control name. |
| Notifications and errors | `src/App.tsx` | Persistent dismissible polite status messages; import/save errors use alerts and actionable recovery text. No timed dismissal hides errors. |

Hover rules apply only on hover-capable devices. Under `prefers-reduced-motion: no-preference`, utility changes use 120ms transitions with `cubic-bezier(.2, 0, 0, 1)` and a 0.96 press scale. Reduced-motion users receive static interaction feedback. There are no endless decorative animations. Demo value changes can be paused separately.

## Do's and Don'ts

- Reuse the semantic palette, six type sizes and existing button/field/modal patterns. Use status text alongside the mint or muted indicator.
- Keep editor helpers and the illustrated preview out of the OBS composition. Keep the source-mode stamp visible, including in demo links.
- For another widget, add its dimensions/type in `src/model.ts`, rendering in `WidgetContent`, a matching icon and validation coverage. Preserve safe bounds and independent live-source failure semantics.
- For another editor surface, begin with the same page gutters and heading/action alignment. Keep the primary action and actual tool visible on the first phone screen.
- Do not turn unknown data into zero, show projections as settled blocks, or describe simulated readings as hardware data. Do not introduce wallet or transaction controls into this product.
- Check custom overlay colors on actual video. The built-in palette's measured contrast does not certify arbitrary user configurations.
