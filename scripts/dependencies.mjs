import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
// The scratch location is an optional contributor toolchain; ordinary npm ci uses the root.
export const dependency = (name) =>
  require.resolve(name, { paths: [process.cwd(), resolve("test/scratch/toolchain")] });
export const loadDependency = (name) => require(dependency(name));
