# LazyReq — Generate Request Bodies from NestJS DTOs

[![Version](https://img.shields.io/visual-studio-marketplace/v/ochoche.lazyreq-nestjs?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=ochoche.lazyreq-nestjs) [![Installs](https://img.shields.io/visual-studio-marketplace/i/ochoche.lazyreq-nestjs)](https://marketplace.visualstudio.com/items?itemName=ochoche.lazyreq-nestjs) [![Pre-release](https://img.shields.io/badge/pre--release-0.1.0-blue)](https://marketplace.visualstudio.com/items?itemName=ochoche.lazyreq-nestjs)

**Generate request payloads straight from your route handlers and DTOs — no more hand-typing JSON.**

LazyReq inspects your NestJS controller's `@Body()` DTO using the TypeScript Compiler API and inserts a realistic JSON payload at your cursor. Zero AI, zero network, fully offline.

![Demo](images/demo.gif)

## Features

* **Active-file, command-triggered** – open a `*.controller.ts`, run `LazyReq: Generate request body JSON` from the Command Palette, JSON appears at the cursor (`src/extension.ts:5`).
* **DTO-aware** – resolves imported DTOs cross-file via `ts.TypeChecker` (`src/parser.ts:342` `createProgram`).
* **Rule-based value generation** (`src/parser.ts:277`):
  * `string` → `"example"`, `@IsEmail()` → `"user@example.com"`, `@IsUrl()` → `"https://example.com"`, `@IsUUID()` → `"550e8400-..."`, `@IsMobilePhone()` → `"+12025550123"`
  * `number` / `@IsInt()` → `1`, `boolean` → `true`
  * `@IsEnum(X)` → first enum member (string or numeric)
  * `@IsOptional()` fields included with sample (configurable in v1.1)
  * Nested DTOs via `@ValidateNested`/`@Type()` – recursed
  * Arrays – single-element array `["example"]` / `[1]`
* **Safe fallback** – DTOs without decorator metadata still generate from TypeScript types.

## Requirements

* VS Code `^1.125.0`
* Workspace with `tsconfig.json` (NestJS project) on disk – required for cross-file resolution. Extension errors clearly if missing (`No tsconfig.json found…`).
* `typescript` available (bundled external via `esbuild.js:38`).

## Usage

1. Open a NestJS controller, e.g. `src/users.controller.ts`:
```ts
@Post()
create(@Body() dto: CreateUserDto) {}
```
2. Place cursor where JSON should be inserted.
3. `Ctrl+Shift+P` → `LazyReq: Generate request body JSON`.
4. Payload inserted:
```json
{
  "name": "example",
  "email": "user@example.com",
  "age": 1,
  "role": "admin"
}
```

For `CreateMemberDto`:
```ts
export class CreateMemberDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsMobilePhone() phoneNumber?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsUUID() @IsNotEmpty() groupId: string;
  @IsEnum(MemberRole) @IsOptional() role?: MemberRole;
}
```
→
```json
{
  "name": "example",
  "phoneNumber": "+12025550123",
  "email": "user@example.com",
  "groupId": "550e8400-e29b-41d4-a716-446655440000",
  "role": "admin"
}
```

## Extension Settings

No settings in v1 (per `lazyreq-spec.md:41`). Future: `.vscode/settings.json` overrides for optional-field inclusion, custom sample values.

## Known Issues

* Only `@Body()` supported in v1 (`lazyreq-spec.md:34`). `@Query()`/`@Param()` are v1.1.
* Single controller file (active editor) – multi-file discovery not yet implemented.
* `PartialType`/`OmitType`/`PickType` mapped types require full `ts.Program` resolution; edge cases may yield `{}` – file an issue with repro.
* No `.http` file output or CodeLens yet – plain JSON insert only.

## Release Notes

### 0.1.0 — Pre-release (preview)

* Initial preview for VS Code Marketplace (`publisher: ochochecharles`).
* Command `lazyreq.generate` with `onCommand` activation.
* Fixes: `IsEnum`+`IsOptional` union, `IsUUID`/`IsMobilePhone` samples, numeric enum support.

See `CHANGELOG.md` for history.

## Contributing / Development

```bash
npm ci
npm run compile        # check-types + lint + esbuild
npm test               # vscode-test via .vscode-test.mjs
node --loader ts-node tools/parse-controller.mts <controller-file>  # standalone parser
```

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
* [Publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) – run `npx @vscode/vsce package` then `vsce publish`.

**Enjoy!** Report bugs at https://github.com/ochochecharles/lazyreq/issues.
