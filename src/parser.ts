import * as ts from 'typescript';
import * as path from 'path';

const ROUTE_DECORATORS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete']);
const BODY_DECORATOR = 'Body';
const CONTROLLER_DECORATOR = 'Controller';
const MAX_DEPTH = 10;

interface EnumMemberReport {
  name: string;
  value: string;
}

interface EnumReport {
  name: string;
  members: EnumMemberReport[];
}

interface TypeInfo {
  kind: 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object' | 'other';
  enum?: EnumReport;
  element?: TypeInfo;
  properties?: DtoPropertyReport[];
}

interface DtoPropertyReport {
  name: string;
  optional: boolean;
  tsType: string;
  decorators: string[];
  typeInfo: TypeInfo;
  sampleValue?: unknown;
}

interface DtoReport {
  typeName: string;
  properties: DtoPropertyReport[];
}

interface RouteReport {
  httpMethod: string;
  path: string;
  methodName: string;
  body?: DtoReport;
}

interface ControllerReport {
  name: string;
  basePath?: string;
  routes: RouteReport[];
}

type BodyResult = { ok: true; json: string } | { ok: false; reason: string };

function getDecoratorsOf(node: ts.Node): readonly ts.Decorator[] {
  if (ts.canHaveDecorators(node)) {
    return ts.getDecorators(node) ?? [];
  }
  return [];
}

function decoratorName(d: ts.Decorator): string | undefined {
  const e = d.expression;
  if (ts.isCallExpression(e)) {
    const callee = e.expression;
    return ts.isIdentifier(callee) ? callee.text : undefined;
  }
  if (ts.isIdentifier(e)) {return e.text;}
  if (ts.isPropertyAccessExpression(e)) {return e.name.text;}
  return undefined;
}

function decoratorArgs(d: ts.Decorator): readonly ts.Expression[] {
  return ts.isCallExpression(d.expression) ? d.expression.arguments : [];
}

function getDecoratorNames(node: ts.Node): string[] {
  return getDecoratorsOf(node)
    .map(decoratorName)
    .filter((n): n is string => !!n);
}

function findControllers(sourceFile: ts.SourceFile): ts.ClassDeclaration[] {
  const classes: ts.ClassDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node)) {classes.push(node);}
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return classes.filter((c) => getDecoratorNames(c).includes(CONTROLLER_DECORATOR));
}

function controllerBasePath(cls: ts.ClassDeclaration): string | undefined {
  for (const d of getDecoratorsOf(cls)) {
    if (decoratorName(d) === CONTROLLER_DECORATOR) {
      const arg = decoratorArgs(d)[0];
      if (arg && ts.isStringLiteral(arg)) {return arg.text;}
    }
  }
  return undefined;
}

function getRouteDecorator(method: ts.MethodDeclaration): ts.Decorator | undefined {
  for (const d of getDecoratorsOf(method)) {
    const n = decoratorName(d);
    if (n && ROUTE_DECORATORS.has(n)) {return d;}
  }
  return undefined;
}

function joinPath(base?: string, sub?: string): string {
  const parts = [base, sub].filter((x): x is string => !!x);
  if (parts.length === 0) {return '/';}
  let p = parts.join('/').replace(/\/+/g, '/');
  if (!p.startsWith('/')) {p = '/' + p;}
  return p;
}

function enumFromType(t: ts.Type): EnumReport | undefined {
  if ((t.flags & ts.TypeFlags.Enum) !== 0) {
    const sym = t.symbol;
    const decl = sym?.declarations?.find(ts.isEnumDeclaration);
    if (decl) {
      return {
        name: sym.getName(),
        members: decl.members.map((m) => ({
          name: m.name.getText(),
          value: m.initializer ? m.initializer.getText() : m.name.getText(),
        })),
      };
    }
  }
  // Handle typeof enum (e.g. `typeof MemberRole` from @IsEnum(MemberRole)) – the type is an object with an enum declaration
  if ((t.flags & ts.TypeFlags.Object) !== 0) {
    const sym = t.symbol;
    const decl = sym?.declarations?.find(ts.isEnumDeclaration);
    if (decl) {
      return {
        name: sym.getName(),
        members: decl.members.map((m) => ({
          name: m.name.getText(),
          value: m.initializer ? m.initializer.getText() : m.name.getText(),
        })),
      };
    }
  }
  if (t.isUnion()) {
    // Strip nullable/void constituents before checking enum-literal union (covers `MemberRole | undefined` from optional enum)
    const withoutNullable = t.types.filter(
      (u) => (u.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void)) === 0,
    );
    const candidates = withoutNullable.length > 0 ? withoutNullable : t.types;
    if (candidates.length > 0 && candidates.every((u) => (u.flags & ts.TypeFlags.EnumLiteral) !== 0)) {
      const firstMemberDecl = candidates[0].symbol?.valueDeclaration;
      const decl = firstMemberDecl && ts.isEnumMember(firstMemberDecl) ? firstMemberDecl.parent : undefined;
      if (decl) {
        return {
          name: decl.name.getText(),
          members: decl.members.map((m) => ({
            name: m.name.getText(),
            value: m.initializer ? m.initializer.getText() : m.name.getText(),
          })),
        };
      }
    }
  }
  return undefined;
}

function enumFromDecorator(decorators: readonly ts.Decorator[], checker: ts.TypeChecker): EnumReport | undefined {
  for (const d of decorators) {
    if (decoratorName(d) !== 'IsEnum') {continue;}
    const arg = decoratorArgs(d)[0];
    if (!arg) {return undefined;}
    return enumFromType(checker.getTypeAtLocation(arg));
  }
  return undefined;
}

function enumInfoFor(loc: ts.Node, t: ts.Type, checker: ts.TypeChecker): EnumReport | undefined {
  return enumFromDecorator(getDecoratorsOf(loc), checker) ?? enumFromType(t);
}

function literalFromText(text: string): string | number | boolean {
  const t = text.trim();
  if (/^'(?:[^'\\]|\\.)*'$/.test(t) || /^"(?:[^"\\]|\\.)*"$/.test(t)) {
    return t.slice(1, -1);
  }
  if (/^-?\d+$/.test(t)) {return Number(t);}
  if (/^-?\d*\.\d+$/.test(t)) {return Number(t);}
  if (t === 'true') {return true;}
  if (t === 'false') {return false;}
  return t;
}

function firstEnumValue(e?: EnumReport): unknown {
  const first = e?.members[0];
  return first ? literalFromText(first.value) : null;
}

function walkProperties(
  type: ts.Type,
  checker: ts.TypeChecker,
  location: ts.Node,
  visited: Set<string>,
  depth: number,
): DtoPropertyReport[] {
  if (depth > MAX_DEPTH) {return [];}
  const key = checker.typeToString(type);
  if (visited.has(key)) {return [];}
  visited.add(key);

  const result: DtoPropertyReport[] = [];
  for (const prop of type.getProperties()) {
    const decl = prop.valueDeclaration ?? location;
    const decorators = getDecoratorNames(decl);
    const propType = checker.getTypeOfSymbolAtLocation(prop, decl);
    const enumInfo = enumInfoFor(decl, propType, checker);
    const typeInfo = buildTypeInfo(propType, checker, enumInfo, decl, visited, depth);
    const report: DtoPropertyReport = {
      name: prop.getName(),
      optional: (prop.flags & ts.SymbolFlags.Optional) !== 0,
      tsType: checker.typeToString(propType),
      decorators,
      typeInfo,
      sampleValue: generateValue(typeInfo, decorators),
    };
    result.push(report);
  }
  return result;
}

function buildTypeInfo(
  t: ts.Type,
  checker: ts.TypeChecker,
  enumInfo: EnumReport | undefined,
  location: ts.Node,
  visited: Set<string>,
  depth: number,
): TypeInfo {
  if (enumInfo) {return { kind: 'enum', enum: enumInfo };}
  if (checker.isArrayType(t)) {
    const el = checker.getTypeArguments(t as ts.TypeReference)[0];
    return {
      kind: 'array',
      element: el ? buildTypeInfo(el, checker, enumFromType(el), location, visited, depth) : undefined,
    };
  }
  if (checker.isTupleType(t)) {
    const elTypes = checker.getTypeArguments(t as ts.TypeReference);
    return {
      kind: 'array',
      element: elTypes[0] ? buildTypeInfo(elTypes[0], checker, enumFromType(elTypes[0]), location, visited, depth) : undefined,
    };
  }
  const fromTypeEnum = enumFromType(t);
  if (fromTypeEnum) {return { kind: 'enum', enum: fromTypeEnum };}
  if (t.isUnion()) {
    const nonVoid = t.types.filter(
      (u) => (u.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void)) === 0,
    );
    if (nonVoid.length === 1) {
      const inner = nonVoid[0];
      return buildTypeInfo(inner, checker, enumFromType(inner), location, visited, depth);
    }
  }
  const f = t.flags;
  if ((f & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral)) !== 0) {return { kind: 'string' };}
  if ((f & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) !== 0) {return { kind: 'number' };}
  if ((f & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) !== 0) {return { kind: 'boolean' };}
  if (t.getProperties().length > 0) {
    return { kind: 'object', properties: walkProperties(t, checker, location, visited, depth + 1) };
  }
  return { kind: 'other' };
}

function generateValue(info: TypeInfo, decorators: string[]): unknown {
  if (decorators.includes('IsDate')) {return '2026-01-01T00:00:00.000Z';}
  if (info.kind === 'string') {
    if (decorators.includes('IsEmail')) {return 'user@example.com';}
    if (decorators.includes('IsUrl')) {return 'https://example.com';}
    if (decorators.includes('IsUUID')) {return '550e8400-e29b-41d4-a716-446655440000';}
    if (decorators.includes('IsMobilePhone') || decorators.includes('IsPhoneNumber')) {return '+12025550123';}
    return 'example';
  }
  switch (info.kind) {
    case 'boolean':
      return true;
    case 'number':
      return 1;
    case 'enum':
      return firstEnumValue(info.enum);
    case 'array':
      return info.element ? [generateValue(info.element, [])] : [];
    case 'object': {
      const obj: Record<string, unknown> = {};
      for (const p of info.properties ?? []) {
        obj[p.name] = p.sampleValue ?? null;
      }
      return obj;
    }
    case 'other':
    default:
      return null;
  }
}

function analyzeBodyParam(param: ts.ParameterDeclaration, checker: ts.TypeChecker): DtoReport {
  const type = checker.getTypeAtLocation(param);
  return {
    typeName: checker.typeToString(type),
    properties: walkProperties(type, checker, param, new Set<string>(), 0),
  };
}

function analyzeController(cls: ts.ClassDeclaration, checker: ts.TypeChecker): ControllerReport {
  const basePath = controllerBasePath(cls);
  const routes: RouteReport[] = [];
  for (const member of cls.members) {
    if (!ts.isMethodDeclaration(member)) {continue;}
    const routeDec = getRouteDecorator(member);
    if (!routeDec) {continue;}
    const httpMethod = decoratorName(routeDec)!;
    const routePath = decoratorArgs(routeDec)[0];
    const subPath = routePath && ts.isStringLiteral(routePath) ? routePath.text : undefined;
    const report: RouteReport = {
      httpMethod,
      path: joinPath(basePath, subPath),
      methodName: member.name.getText(),
    };
    for (const p of member.parameters) {
      if (getDecoratorNames(p).includes(BODY_DECORATOR)) {
        report.body = analyzeBodyParam(p, checker);
        break;
      }
    }
    routes.push(report);
  }
  return { name: cls.name?.getText() ?? '(anonymous)', basePath, routes };
}

function createProgram(filePath: string): { program: ts.Program; controllerFile: string } | { error: string } {
  const controllerFile = path.resolve(filePath);
  const tsconfig = ts.findConfigFile(path.dirname(controllerFile), ts.sys.fileExists, 'tsconfig.json');
  if (!tsconfig) {
    return { error: `No tsconfig.json found for ${controllerFile}` };
  }
  const configFile = ts.readConfigFile(tsconfig, ts.sys.readFile);
  if (configFile.error) {
    return { error: ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n') };
  }
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsconfig));
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
  if (!program.getSourceFile(controllerFile)) {
    return { error: `File is not part of the program (check tsconfig include): ${controllerFile}` };
  }
  return { program, controllerFile };
}

function analyzeControllers(filePath: string): { controllers: ControllerReport[]; error?: string } {
  const created = createProgram(filePath);
  if ('error' in created) {return { controllers: [], error: created.error };}
  const checker = created.program.getTypeChecker();
  const sourceFile = created.program.getSourceFile(created.controllerFile);
  const controllers = sourceFile
    ? findControllers(sourceFile).map((c) => analyzeController(c, checker))
    : [];
  return { controllers };
}

function generateBodyJson(filePath: string): BodyResult {
  const { controllers, error } = analyzeControllers(filePath);
  if (error) {return { ok: false, reason: error };}
  if (controllers.length === 0) {
    return { ok: false, reason: 'No @Controller class found in this file.' };
  }
  for (const controller of controllers) {
    for (const route of controller.routes) {
      if (!route.body) {continue;}
      const obj: Record<string, unknown> = {};
      for (const p of route.body.properties) {
        obj[p.name] = p.sampleValue ?? null;
      }
      return { ok: true, json: JSON.stringify(obj, null, 2) };
    }
  }
  return { ok: false, reason: 'No route with an @Body() parameter found in this file.' };
}

export { analyzeControllers, generateBodyJson };
export type {
  ControllerReport,
  DtoPropertyReport,
  DtoReport,
  RouteReport,
  TypeInfo,
};