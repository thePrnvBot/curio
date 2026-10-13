# Curio

AI chat learning app ("Director" / Courses) built as a pnpm monorepo with
TanStack Start, Vercel AI SDK, tRPC, Drizzle (Postgres) and Effect TypeScript.

## VendoredRepositories

This project vendors external repositories under @repos/

- Use vendored repositories as read-only reference material when working with
  related libraries
- Prefer examples and patterns from the vendored source code over generated
  guesses or web search results
- Do not edit files under @repos/ unless explicitly asked
- Do not import from @repos/ - application code imports from normal package
  dependencies instead

## Effect TypeScript

The project uses `effect` v4 (currently `effect@4.0.2`).

When writing Effect code, inspect @repos/effect for examples of idiomatic
usage, tests, module structure, and API design. Treat it as the source of
truth for Effect patterns - especially for `Schema`, `Effect`, `Layer`,
`Option`, and the runtime/Layer composition used in `packages/api`.

- Read @repos/effect/LLMS.md before writing any Effect code
- Prefer reading real source and tests under @repos/effect over assuming a
  v3-era API: constructors such as `Schema.Struct`, `Schema.Array`,
  `Schema.Literal`, `Schema.decodeUnknownOption`, `Schema.isMinLength` should
  be confirmed against the vendored source before use
