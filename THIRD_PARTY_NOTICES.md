# Third-party notices

The original hamster-wheel broadcast mark, favicon, forest preview illustration and share-card composition are application assets created for Squeek Studio.

DM Sans is bundled locally under the SIL Open Font License, version 1.1. Its complete notice and license are in `public/fonts/OFL.txt` and in the static export's `fonts/OFL.txt`.

The implementation and review applied the pinned Better Interface design guidance by Jakub Krehel, MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`. Design-documentation guidance was adapted from Paul Bakaus's Impeccable, Apache-2.0, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. The supplied combined license texts are retained in `licenses/design-guidance.txt`. These guidance sources do not change the application's requested scope.

The Squeekchain response schemas in `src/schemas/` are unmodified public API definitions from `https://docs.squeekchain.com/assets/api/`, retrieved on 2026-11-04. Public API response fixtures under `scripts/fixtures/` were captured on that date for deterministic tests; the production client never imports them.

React, Ajv, ajv-formats and the development tools retain their respective upstream licenses. Package names, exact versions and integrity hashes are recorded in package-lock.json; bundled third-party copyright/license comments are retained by the production build.

The generated standalone validators include Ajv's Unicode-length helper and ajv-formats' format functions. Their MIT notices are also retained in `public/licenses/validator-runtime.txt`, copied into `dist/licenses/validator-runtime.txt` for static distribution. The Ajv compiler is used only by the Node build step.
