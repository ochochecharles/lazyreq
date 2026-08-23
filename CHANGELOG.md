# Change Log

All notable changes to the "lazyreq" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.1.0] - 2026-08-23

### Added
- Initial pre-release for VS Code Marketplace (publisher `ochoche`).
- Command `lazyreq.generate` (`onCommand:lazyreq.generate` activation) – inserts generated JSON at cursor.
- TypeScript `TypeChecker`-based DTO resolution (`src/parser.ts`) supporting cross-file imports, nested DTOs, arrays, enums.
- Rule-based samples: `IsEmail`, `IsUrl`, `IsUUID`, `IsMobilePhone`/`IsPhoneNumber`, `IsDate`, `IsEnum` (including `IsOptional` + enum union), `IsInt`/`number`, `boolean`.

### Fixed
- `IsEnum` with `@IsOptional()` (e.g. `role?: MemberRole`) now correctly returns first enum value instead of `null`.
- `IsUUID` and `IsMobilePhone` now emit realistic values (`550e8400-...`, `+12025550123`) instead of generic `"example"`.
- `typeof Enum` decorator argument handling for `enumFromType`.

## [Unreleased]

- Planned: `@Query`/`@Param` support, CodeLens, `.http` output, settings overrides, Go struct support (per `lazyreq-spec.md`).
