import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/** Include command code only when an exported HTTP handler actually delegates to it. */
export function readRouteSource(
  file: string,
  read: (file: string) => string = (file) => readFileSync(file, "utf8")
): string {
  const source = read(file);
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const called = new Set<string>();
  for (const node of ast.statements) {
    if (
      !ts.isFunctionDeclaration(node) ||
      !node.name ||
      !/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(node.name.text) ||
      !node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    )
      continue;
    const statement = node.body?.statements[0];
    if (!statement || !ts.isReturnStatement(statement)) continue;
    const expression = statement.expression;
    if (expression && ts.isCallExpression(expression) && ts.isIdentifier(expression.expression))
      called.add(expression.expression.text);
  }
  const delegates = new Set<string>();
  for (const node of ast.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const specifier = node.moduleSpecifier.text;
    const bindings = node.importClause?.namedBindings;
    if (
      !specifier.startsWith("@/lib/api/commands/") ||
      !specifier.endsWith("/handlers") ||
      !bindings ||
      !ts.isNamedImports(bindings)
    )
      continue;
    if (bindings.elements.some((binding) => called.has(binding.name.text)))
      delegates.add(path.join(process.cwd(), "src", specifier.slice(2) + ".ts"));
  }
  return [source, ...[...delegates].map(read)].join("\n");
}
