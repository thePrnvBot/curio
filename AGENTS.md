# Curio

AI chat learning app ("Director" / Courses) built as a pnpm monorepo with
TanStack Start, Vercel AI SDK, tRPC, Drizzle (Postgres) and Effect TypeScript.

## Effect TypeScript

The project uses `effect` v4 (currently `effect@4.0.2`), installed as a normal
package dependency.

When writing Effect code, consult the installed package sources under
`node_modules/effect` for the actual API surface, and the existing code under
`packages/api` for this project's idioms. Treat those as the source of truth
for `Schema`, `Effect`, `Layer`, `Option`, and the runtime/Layer composition
used in `packages/api`.

- Do not assume a v3-era API: constructors such as `Schema.Struct`,
  `Schema.Array`, `Schema.Literal`, `Schema.decodeUnknownOption`,
  `Schema.isMinLength` should be confirmed against the installed package
  before use.
- Match the Effect patterns already used in `packages/api` (services as
  `Context.Tag`s, domain failures as `Data.TaggedError`s, composition in
  `composition/runtime.ts`).

## Testing

- Tests run with Vitest through a workspace config (`vitest.config.ts` at the
  root, project configs under `packages/api/vitest.config.ts` and
  `apps/web/vitest.config.ts`).
- Run the full suite with `pnpm test` and coverage with `pnpm test:coverage`.
- `apps/web` tests use `jsdom` and `@testing-library/jest-dom` (setup in
  `apps/web/src/test/setup.ts`).
- The three local gates are `pnpm lint`, `pnpm check-types`, and `pnpm test`;
  run all three before committing.
- Do not configure Vitest to pass when no tests are found: an empty suite must
  fail the gate instead of passing vacuously.
- When adding new pure helpers (e.g. parsers, validators, URL filters), export
  them and add unit tests in the same directory using the existing `.test.ts`
  convention.
