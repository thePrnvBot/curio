# Curio

Curio is an AI-powered learning app. A conversational agent called **the Director** talks with you about what you want to learn, then builds a structured course — sections, lessons, quizzes, interactive animations and narrated code walkthroughs — directly in the chat.

> **Status:** active MVP. Expect rough edges, especially around deployment and the optional third-party integrations described below.

## Features

- **Director chat** — streaming agent chat with visible tool calls, web search, web page reading, follow-up questions and a detached/durable run model that survives a dropped connection.
- **Courses** — AI-generated courses with video, card, animation, recap/quiz and guided-explanation lessons.
- **Artifacts** — publish generated HTML, Markdown, SVG or text documents to an optional Artifact Server and review them in a sandboxed iframe.
- **Guided explanations** — step-by-step narrated explanations with code focus, a moving cursor and optional local text-to-speech.
- **Bring your own model** — use the server default or save a per-user OpenAI or OpenAI-compatible provider from Settings.
- **Multi-user auth** — Better Auth email/password sessions backed by Postgres.
- **Theming and polish** — light/dark/system themes, interaction sounds and a responsive mobile dock.

## Tech stack

| Layer         | Choice                                                   |
| ------------- | -------------------------------------------------------- |
| App framework | [TanStack Start](https://tanstack.com/start) + React 19  |
| API           | [tRPC](https://trpc.io) and TanStack Start server routes |
| AI            | [Vercel AI SDK](https://sdk.vercel.ai)                   |
| Effects / DI  | [Effect](https://effect.website) v4                      |
| Database      | PostgreSQL + [Drizzle ORM](https://orm.drizzle.team)     |
| Auth          | [Better Auth](https://www.better-auth.com)               |
| UI            | Tailwind CSS v4, shadcn/ui primitives, Base UI           |
| Tooling       | pnpm workspaces, Vite+, Oxlint/Oxfmt (Ultracite)         |

## How it works

The Director is instructed to:

1. Ask a few multiple-choice questions about the learner's level and goals.
2. Create a course outline with `create_course` (sections + empty lessons).
3. Fill every lesson in order with `create_lesson` (video prose, card decks, quiz questions, HTML animations, guided explanations).
4. Optionally publish a standalone deliverable with `create_artifact`.

Course and chat data live in Postgres. Agent runs are committed to the database chunk by chunk, so reopening a chat replays the run instead of re-requesting the model. Submitting a message claims a per-chat running run atomically; a second tab gets `409` instead of starting a duplicate generation. The transcript is persisted before the run is marked `done`, and a crashed process hands back its committed partial text on the next load. Course lessons are filled by a detached background fiber; the course page polls the structure and swaps in content as it lands, so leaving the page never cancels the model work.

## Repository layout

```
curio/
├── apps/
│   └── web/                 # TanStack Start app: routes, UI, server routes
├── packages/
│   ├── api/                 # Domain, services, infrastructure, tRPC routers
│   │   └── src/
│   │       ├── domain/          # Pure types + typed errors
│   │       ├── services/        # Effect Context contracts (ports)
│   │       ├── infrastructure/  # Drizzle, AI SDK, MCP, web adapters
│   │       ├── routers/         # tRPC procedures
│   │       └── composition/     # Runtime/Layer wiring
│   ├── auth/                # Better Auth configuration
│   ├── db/                  # Drizzle schema, migrations, seed scripts
│   ├── ui/                  # Shared shadcn/ui + AI Elements components
│   └── config/              # Shared TypeScript config
├── docs/                    # Design notes
└── artifact-server/         # Optional local artifact server (git-ignored)
```

The dependency direction is `domain → services → infrastructure → composition`. The web app wires concrete adapters into a single Effect runtime in `apps/web/src/services.ts`; routers never construct database or model clients themselves.

## Getting started

### Prerequisites

- Node.js with Corepack enabled
- [pnpm](https://pnpm.io) 11 (the repo pins `pnpm@11.8.0`)
- A PostgreSQL database

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp apps/web/.env.example apps/web/.env
```

Then fill in `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and the AI provider variables. See [Environment variables](#environment-variables).

Generate a secret with:

```bash
openssl rand -base64 32
```

### 3. Create the database schema

For local development, push the schema directly:

```bash
pnpm db:push
```

For an environment that tracks migrations, apply the checked-in migrations instead:

```bash
pnpm db:migrate
```

> `db:push` and `db:migrate` are alternative workflows. Do not mix them against the same database unless you know how Drizzle's migration journal is set up.

### 4. Run the app

```bash
pnpm dev
```

Open <http://localhost:3001>. Register an account, then open **Chat** and ask the Director to build a course.

## Environment variables

Core server configuration is validated in `apps/web/src/env.server.ts`.

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string. |
| `BETTER_AUTH_SECRET` | yes | Session secret, at least 32 characters. |
| `BETTER_AUTH_URL` | yes | Public URL of the app, e.g. `http://localhost:3001`. |
| `AI_BASE_URL` | yes | Base URL of an OpenAI or OpenAI-compatible API. |
| `AI_API_KEY` | yes | Server default model API key. |
| `AI_MODEL` | yes | Model ID used by default, e.g. `gpt-4o-mini`. |
| `AI_PROTOCOL` | no | `chat-completions` (default) or `responses`. |
| `AI_STRUCTURED_OUTPUTS` | no | `true` (default) sends JSON Schema response formats. Set `false` for gateways that reject them. |
| `MODEL_SETTINGS_ENCRYPTION_KEY` | no | At least 32 chars. Encrypts per-user model keys at rest; defaults to `BETTER_AUTH_SECRET` when unset. |
| `ARTIFACT_SERVER_URL` | no | MCP endpoint of an Artifact Server, e.g. `http://127.0.0.1:8787/mcp`. Origin-only URLs are normalized to `/mcp`. Enables artifact publishing. |
| `ARTIFACT_SERVER_API_KEY` | no | Bearer token for the Artifact Server (local token file: `artifact-server/.artifact-server/local-api-token`). |
| `OBSCURA_BIN` | no | Path/name of the Obscura CLI used by `web_read`. |
| `OBSCURA_STEALTH` | no | Set to `1` to pass `--stealth` to Obscura. |

Per-user model settings are stored in the `user_model_settings` table. API keys are encrypted at rest with AES-256-GCM (versioned `enc:v1:` values; legacy plaintext rows are read and re-encrypted on the next save) and are never returned by the API; responses expose only `hasApiKey`.

### Optional integrations

- **Obscura** (`web_read`) — install the [Obscura](https://docs.obscura.sh) CLI and make sure it is on `PATH`, or set `OBSCURA_BIN`. Without it, web search still works and `web_read` returns an install hint.
- **Artifact Server** (`create_artifact`) — point `ARTIFACT_SERVER_URL` at an Artifact Server MCP endpoint (`http://127.0.0.1:8787/mcp`; an origin-only URL is normalized automatically) and set `ARTIFACT_SERVER_API_KEY` to the server's bearer token. When the URL is unset, artifact tools are disabled and the `/api/artifacts/generate` route answers `501`. A reachability warning is logged at boot.

## Available scripts

| Command              | What it does                                 |
| -------------------- | -------------------------------------------- |
| `pnpm dev`           | Start all workspaces in development mode.    |
| `pnpm dev:web`       | Start only the web app.                      |
| `pnpm build`         | Build all workspaces.                        |
| `pnpm check-types`   | Type-check every package.                    |
| `pnpm check`         | Ultracite checks plus workspace type checks. |
| `pnpm lint`          | Run Oxlint.                                  |
| `pnpm format`        | Run Oxfmt.                                   |
| `pnpm fix`           | Apply Ultracite fixes and formatting.        |
| `pnpm db:push`       | Push the Drizzle schema to the database.     |
| `pnpm db:generate`   | Generate a migration from schema changes.    |
| `pnpm db:migrate`    | Apply checked-in migrations.                 |
| `pnpm db:studio`     | Open Drizzle Studio.                         |
| `pnpm auth:generate` | Regenerate the Better Auth Drizzle schema.   |

## Deployment notes

- Curio is a long-running Node server, not a set of stateless edge functions. Durable agent runs keep process-local abort controllers/registrations in memory, so prefer a single persistent instance (or sticky sessions) unless you add shared coordination.
- Set `BETTER_AUTH_URL` to the exact public origin; it is the only trusted origin configured for Better Auth.
- Run migrations before starting the app: `pnpm db:migrate`.
- Email verification is not enabled, and Better Auth's rate limiter does not cover the AI routes. Add signup controls and per-user request/usage limits before exposing a public instance, especially if you pay for model usage.
- Generated artifacts and lesson animations render in an iframe sandboxed with `allow-scripts allow-forms` and a null origin. They cannot read Curio cookies or storage, but they can still make outbound network requests. Treat model-generated HTML as untrusted content.

## Security

- Never commit `apps/web/.env`; only `.env.example` belongs in git.
- Chat, course and artifact routes require an authenticated session and scope reads/writes to the session user.
- `web_read` rejects loopback, private, link-local and reserved addresses. It cannot fully defend against DNS rebinding; if you need stronger isolation, run the reader in a network-restricted sandbox.
- Per-user API keys are encrypted with AES-256-GCM before they are stored in Postgres. Set a dedicated `MODEL_SETTINGS_ENCRYPTION_KEY` in production and keep it stable: rotating it makes previously saved keys unreadable (users can re-enter them).

## Contributing

1. Fork and create a feature branch.
2. Run `pnpm check-types` and `pnpm fix` before opening a pull request.
3. Keep domain contracts in `packages/api/src/domain` and `services` free of framework imports.

## License

[MIT](LICENSE)
