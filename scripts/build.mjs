import { generateValidators } from "./generate-validators.mjs";
import { dependency } from "./dependencies.mjs";
import { pathToFileURL } from "node:url";

await generateValidators();
const { build } = await import(pathToFileURL(dependency("vite")).href);
// Dependency paths only; the project's Vite configuration and relative base remain authoritative.
await build({ resolve: { alias: {
  "react/jsx-runtime": dependency("react/jsx-runtime"),
  "react-dom/client": dependency("react-dom/client"),
  "react-dom": dependency("react-dom"),
  react: dependency("react"),
} } });
