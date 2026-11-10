/**
 * Prove every exported POST/PUT/PATCH/DELETE route handler reaches an auth guard.
 *
 * - inline: the handler, or a route-local function it calls, calls a guard.
 * - handler: an imported function it calls reaches a guard, up to
 *   MAX_IMPORT_DEPTH import hops; re-exports do not spend a hop.
 * - inert: the handler only returns an error response.
 * - allowlisted: a reviewed public endpoint in mutationRouteAuth.allowlist.ts.
 * Anything else is unguarded. Nullable session lookups count only when an
 * anonymous result exits early. Guards are matched by callee name.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

export const MUTATION_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;
export type MutationMethod = (typeof MUTATION_METHODS)[number];
const MAX_IMPORT_DEPTH = 2;

/** Callees that reject an unauthenticated or untrusted caller themselves. */
export const GUARD_CALLEES = new Set([
  "requireAuth",
  "requireBasicAuth",
  "requireAuthWithCharacter",
  "requireHumanSession",
  "requireHumanSessionWithCharacter",
  "requireAdmin",
  "requireModerator",
  "requireAdminOrApiKey",
  "requireCron",
  "requireBotToken",
  "requireBotApiAccess",
  "requireUserApiKey",
  "requireAskToken",
  "requireLakesideToken",
  // 404 on a hosted deployment, loopback Host only on a local install.
  "requireSingleplayer",
  // Third-party callbacks verified by signature.
  "parseAndVerifyPatreonWebhook",
]);

/** Lookups that return null for an anonymous caller instead of rejecting. */
export const SOFT_GUARD_CALLEES = new Set([
  "getAuthUser",
  "getAuthUserWithCharacter",
  "getAuthUserFromToken",
  "getAuthAdmin",
  "getAuthModerator",
  "verifyAuth",
  "verifyAuthToken",
  "validateUserApiKey",
]);

export type Resolution = "inline" | "handler" | "inert" | "allowlisted" | "unguarded";

export interface MutationHandler {
  route: string;
  method: MutationMethod;
  resolution: Resolution;
  via?: string;
}

interface ModuleInfo {
  file: string;
  source: ts.SourceFile;
  /** Top-level function-like declarations by local name. */
  locals: Map<string, ts.Node>;
  /** Imported local name -> { module specifier, imported name }. */
  imports: Map<string, { specifier: string; name: string }>;
  /** Exported name -> local name, or a re-export from another module. */
  exports: Map<string, { local?: string; specifier?: string; name?: string }>;
  starExports: string[];
}

export class GuardResolver {
  private modules = new Map<string, ModuleInfo | null>();
  private memo = new Map<string, string | null>();

  constructor(private readonly root: string) {}

  /** Resolve an import specifier from `fromFile` to a source file, if it is in the repo. */
  resolveSpecifier(fromFile: string, specifier: string): string | null {
    let base: string;
    if (specifier.startsWith("@/")) base = join(this.root, "src", specifier.slice(2));
    else if (specifier.startsWith("@shared/"))
      base = join(this.root, "shared", specifier.slice("@shared/".length));
    else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
    else return null;
    for (const candidate of [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      join(base, "index.ts"),
      join(base, "index.tsx"),
    ]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    return null;
  }

  module(file: string): ModuleInfo | null {
    if (this.modules.has(file)) return this.modules.get(file)!;
    let info: ModuleInfo | null = null;
    if (existsSync(file)) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true
      );
      info = {
        file,
        source,
        locals: new Map(),
        imports: new Map(),
        exports: new Map(),
        starExports: [],
      };
      collectModule(info);
    }
    this.modules.set(file, info);
    return info;
  }

  /**
   * Describe where `name` in `file` reaches a guard, or null. `depth` counts the
   * import hops still allowed.
   */
  reachesGuard(file: string, name: string, depth: number): string | null {
    const key = `${file}#${name}#${depth}`;
    if (this.memo.has(key)) return this.memo.get(key)!;
    this.memo.set(key, null);
    const result = this.resolveName(file, name, depth);
    this.memo.set(key, result);
    return result;
  }

  private resolveName(file: string, name: string, depth: number): string | null {
    const info = this.module(file);
    if (!info) return null;
    const local = info.locals.get(name);
    if (local) return this.reachesFromNode(info, local, depth);
    const imported = info.imports.get(name);
    if (imported) return this.followImport(info, imported.specifier, imported.name, depth);
    const exported = info.exports.get(name);
    if (exported?.local && exported.local !== name)
      return this.reachesGuard(file, exported.local, depth);
    if (exported?.specifier)
      return this.followImport(info, exported.specifier, exported.name ?? name, depth, true);
    for (const specifier of info.starExports) {
      const hit = this.followImport(info, specifier, name, depth, true);
      if (hit) return hit;
    }
    return null;
  }

  private followImport(
    info: ModuleInfo,
    specifier: string,
    name: string,
    depth: number,
    reexport = false
  ): string | null {
    const target = this.resolveSpecifier(info.file, specifier);
    if (!target) return null;
    // A re-export forwards the same binding, so it does not spend a hop.
    const remaining = reexport ? depth : depth - 1;
    if (remaining < 0) return null;
    const hit = this.reachesGuard(target, name, remaining);
    return hit ? hit : null;
  }

  /** Scan a function or expression for guard calls and follow the calls it makes. */
  reachesFromNode(info: ModuleInfo, node: ts.Node, depth: number): string | null {
    const callees: string[] = [];
    const visit = (child: ts.Node): void => {
      if (ts.isCallExpression(child) || ts.isNewExpression(child)) {
        const callee = calleeName(child.expression);
        if (callee && SOFT_GUARD_CALLEES.has(callee)) {
          if (softGuardEnforced(child)) callees.push(callee);
        } else if (callee) callees.push(callee);
      }
      // Functions passed by reference (`withAuth(handler)`, `.then(check)`) also run.
      if (ts.isIdentifier(child) && isPassedByReference(child)) callees.push(child.text);
      ts.forEachChild(child, visit);
    };
    visit(node);
    const where = repoPath(this.root, info.file);
    const direct = callees.find(
      (callee) => GUARD_CALLEES.has(callee) || SOFT_GUARD_CALLEES.has(callee)
    );
    if (direct) return `${where}:${direct}`;
    for (const callee of callees) {
      if (!info.locals.has(callee) && !info.imports.has(callee)) continue;
      const hit = this.reachesGuard(info.file, callee, depth);
      if (hit) return hit;
    }
    return null;
  }
}

/** Walk out of await, parentheses, casts and `.catch(...)` to the value a call produces. */
function valueOf(call: ts.Node): ts.Node {
  let node = call;
  for (;;) {
    const parent = node.parent;
    if (
      ts.isAwaitExpression(parent) ||
      ts.isParenthesizedExpression(parent) ||
      ts.isNonNullExpression(parent) ||
      ts.isAsExpression(parent)
    ) {
      node = parent;
    } else if (
      ts.isPropertyAccessExpression(parent) &&
      parent.name.text === "catch" &&
      ts.isCallExpression(parent.parent)
    ) {
      node = parent.parent;
    } else return node;
  }
}

function exits(statement: ts.Statement): boolean {
  if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true;
  return ts.isBlock(statement) && statement.statements.some(exits);
}

function enclosingFunction(node: ts.Node): ts.Node {
  let current = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isFunctionLike(current)) return current;
    current = current.parent;
  }
  return current;
}

/** A nullable session lookup only guards when an anonymous result exits early. */
export function softGuardEnforced(call: ts.CallExpression | ts.NewExpression): boolean {
  const value = valueOf(call);
  const parent = value.parent;
  if (ts.isPrefixUnaryExpression(parent) && parent.operator === ts.SyntaxKind.ExclamationToken) {
    const test = parent.parent;
    return ts.isIfStatement(test) && test.expression === parent && exits(test.thenStatement);
  }
  if (!ts.isVariableDeclaration(parent) || !ts.isIdentifier(parent.name)) return false;
  const name = parent.name.text;
  const anonymous = new RegExp(
    `!\\s*\\(?\\s*${name}\\b|\\b${name}\\s*={2,3}\\s*(null|undefined)\\b`
  );
  let enforced = false;
  const visit = (node: ts.Node): void => {
    if (enforced) return;
    if (
      ts.isIfStatement(node) &&
      node.getStart() > call.getEnd() &&
      anonymous.test(node.expression.getText()) &&
      exits(node.thenStatement)
    ) {
      enforced = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(enclosingFunction(call));
  return enforced;
}

/** A retired handler: its whole body returns an error response. */
export function isInert(node: ts.Node | undefined): boolean {
  if (!node || !ts.isFunctionLike(node)) return false;
  const body = (node as { body?: ts.Node }).body;
  if (!body) return false;
  let returned: ts.Node | undefined = body;
  if (ts.isBlock(body)) {
    const only = body.statements.length === 1 ? body.statements[0] : undefined;
    returned = only && ts.isReturnStatement(only) ? only.expression : undefined;
  }
  if (!returned || !ts.isCallExpression(returned)) return false;
  if (calleeName(returned.expression) !== "errorResponse") return false;
  let nested = false;
  returned.arguments.forEach(function scan(arg: ts.Node): void {
    if (ts.isCallExpression(arg) || ts.isNewExpression(arg) || ts.isAwaitExpression(arg))
      nested = true;
    ts.forEachChild(arg, scan);
  });
  return !nested;
}

function calleeName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (ts.isNonNullExpression(expression) || ts.isParenthesizedExpression(expression))
    return calleeName(expression.expression);
  return null;
}

function isPassedByReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (
    (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
    (parent.arguments ?? []).some((arg) => arg === node)
  );
}

function hasExportModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function collectModule(info: ModuleInfo): void {
  for (const statement of info.source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      const clause = statement.importClause;
      if (clause?.name) info.imports.set(clause.name.text, { specifier, name: "default" });
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          info.imports.set(element.name.text, {
            specifier,
            name: (element.propertyName ?? element.name).text,
          });
        }
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name) {
      info.locals.set(statement.name.text, statement);
      if (hasExportModifier(statement))
        info.exports.set(statement.name.text, { local: statement.name.text });
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        info.locals.set(declaration.name.text, declaration.initializer);
        if (hasExportModifier(statement))
          info.exports.set(declaration.name.text, { local: declaration.name.text });
      }
    } else if (ts.isClassDeclaration(statement) && statement.name) {
      info.locals.set(statement.name.text, statement);
    } else if (ts.isExportDeclaration(statement)) {
      const specifier =
        statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : undefined;
      const clause = statement.exportClause;
      if (!clause) {
        if (specifier) info.starExports.push(specifier);
      } else if (ts.isNamedExports(clause)) {
        for (const element of clause.elements) {
          const original = (element.propertyName ?? element.name).text;
          info.exports.set(
            element.name.text,
            specifier ? { specifier, name: original } : { local: original }
          );
        }
      }
    } else if (ts.isExportAssignment(statement)) {
      info.locals.set("default", statement.expression);
    }
  }
}

export function listRouteFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "route.ts" || entry.name === "route.tsx") out.push(full);
    }
  };
  walk(join(root, "src/app"));
  return out.sort();
}

/** Repo-relative path with forward slashes, so Windows checkouts match the allowlist. */
const repoPath = (root: string, file: string) => relative(root, file).replace(/\\/g, "/");

/** Route key used by the allowlist: repo-relative file and method. */
export const routeKey = (route: string, method: string) => `${route} ${method}`;

export function findMutationHandlers(
  root: string,
  allowlist: Record<string, string>
): MutationHandler[] {
  const resolver = new GuardResolver(root);
  const handlers: MutationHandler[] = [];
  for (const file of listRouteFiles(root)) {
    const info = resolver.module(file)!;
    const route = repoPath(root, file);
    const exported = new Set([...info.exports.keys()]);
    for (const method of MUTATION_METHODS) {
      if (!exported.has(method) && !info.starExports.length) continue;
      if (!exported.has(method)) {
        // `export * from` can surface a handler; only count it when it resolves.
        const target = info.starExports
          .map((s) => resolver.resolveSpecifier(file, s))
          .find((t) => t && resolver.module(t)?.exports.has(method));
        if (!target) continue;
      }
      if (isInert(info.locals.get(info.exports.get(method)?.local ?? method))) {
        handlers.push({ route, method, resolution: "inert" });
        continue;
      }
      const inline = resolver.reachesGuard(file, method, 0);
      if (inline) {
        handlers.push({ route, method, resolution: "inline", via: inline });
        continue;
      }
      const delegated = resolver.reachesGuard(file, method, MAX_IMPORT_DEPTH);
      if (delegated) {
        handlers.push({ route, method, resolution: "handler", via: delegated });
        continue;
      }
      handlers.push({
        route,
        method,
        resolution: allowlist[routeKey(route, method)] ? "allowlisted" : "unguarded",
      });
    }
  }
  return handlers;
}
