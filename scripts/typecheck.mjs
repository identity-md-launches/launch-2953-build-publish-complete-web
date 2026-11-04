import { resolve, dirname } from "node:path";
import { dependency, loadDependency } from "./dependencies.mjs";

const ts = loadDependency("typescript");
const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const reactTypes = dirname(dependency("@types/react/package.json"));
const reactDomTypes = dirname(dependency("@types/react-dom/package.json"));
// Only supplies dependency lookup when a contributor's toolchain is outside the source tree.
const options = { ...parsed.options, paths: {
  react: [resolve(reactTypes, "index.d.ts")],
  "react/*": [resolve(reactTypes, "*")],
  "react-dom/*": [resolve(reactDomTypes, "*")],
}, typeRoots: [resolve(reactTypes, "..")] };
const program = ts.createProgram(parsed.fileNames, options);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => process.cwd(), getCanonicalFileName: (name) => name, getNewLine: () => "\n",
  }));
  process.exitCode = 1;
} else console.log("Typecheck passed (project tsconfig.json, no emit)");
