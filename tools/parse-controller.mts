import { analyzeControllers } from '../src/parser.ts';
import type { ControllerReport, DtoPropertyReport } from '../src/parser.ts';

function printProperty(p: DtoPropertyReport, indent: string): void {
  const opt = p.optional ? '?' : '';
  const dec = p.decorators.length ? ` [${p.decorators.join(', ')}]` : '';
  const enumPart = p.typeInfo.enum
    ? ` { ${p.typeInfo.enum.members.map((m) => `${m.name}=${m.value}`).join(', ')} }`
    : '';
  const isScalar = ['string', 'number', 'boolean', 'enum', 'other'].includes(p.typeInfo.kind);
  const val = isScalar && p.sampleValue !== undefined ? `  => ${JSON.stringify(p.sampleValue)}` : '';
  console.log(`${indent}${p.name}${opt}: ${p.tsType}${dec}${enumPart}${val}`);
  if (p.typeInfo.kind === 'object') {
    for (const np of p.typeInfo.properties ?? []) printProperty(np, indent + '    ');
  }
}

function jsonBody(properties: DtoPropertyReport[]): string {
  const obj: Record<string, unknown> = {};
  for (const p of properties) {
    obj[p.name] = p.sampleValue ?? null;
  }
  return JSON.stringify(obj, null, 2);
}

function printReport(controllerFile: string, controllers: ControllerReport[]): void {
  console.log(`Controller file: ${controllerFile}\n`);
  if (controllers.length === 0) {
    console.log('No @Controller classes found in file.');
    return;
  }
  for (const c of controllers) {
    console.log(`Controller: ${c.name}${c.basePath ? `  (base path: ${c.basePath})` : ''}`);
    if (c.routes.length === 0) {
      console.log('  (no route methods found)');
    }
    for (const r of c.routes) {
      console.log(`  @${r.httpMethod.toUpperCase()} ${r.path}  -> ${r.methodName}()`);
      if (r.body) {
        console.log(`    @Body DTO: ${r.body.typeName}`);
        for (const p of r.body.properties) {
          printProperty(p, '      ');
        }
        const bodyJson = jsonBody(r.body.properties);
        console.log('    generated body JSON:');
        for (const line of bodyJson.split('\n')) {
          console.log(`      ${line}`);
        }
      } else {
        console.log('    (no @Body parameter)');
      }
    }
    console.log('');
  }
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node tools/parse-controller.mts <controller-file>');
    process.exit(1);
  }
  const controllerFile = args[0];
  const { controllers, error } = analyzeControllers(controllerFile);
  if (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
  printReport(controllerFile, controllers);
}

main();