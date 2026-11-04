import { loadDependency } from "./dependencies.mjs";

// Parse JavaScript so harmless helper metadata strings are not mistaken for executable require().
export function checkRuntime(source, filename) {
  const ts = loadDependency("typescript");
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  function visit(node) {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee) ? callee.text :
        ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
      if (["eval", "Function", "require", "__require"].includes(name))
        throw new Error(`${filename} contains executable ${name} at ${node.pos}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
}
