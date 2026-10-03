# Turflow

A small-AI front desk for Noor's farm tours: visitors write by email or SMS in any language,
Noor approves from a basic phone by SMS, and the AI only classifies and translates. Code decides.

Monorepo built with [Turborepo](https://turborepo.dev) and bun workspaces.

```
apps/
  web/                    Lovable TanStack Start app: UI, server functions, webhook routes
packages/
  engine/                 Backend domain: workflow engine, booking state machine, AI adapter (server-only)
  db/                     Supabase types + admin client, migrations, Supabase project config
  ui/                     Design system: shadcn components + theme (globals.css)
  typescript-config/      Shared strict tsconfig
```

## Local development (Makefile)

Needs Docker running, Node, and an OpenAI API key. bun, the Supabase CLI and wrangler run through
`npx` when they aren't installed.

```sh
OPENAI_API_KEY=sk-... make setup   # deps, local Supabase in Docker, migrations + seed, apps/web/.env.local
make dev                           # app on http://localhost:8080 against the local stack
make e2e                           # real webhooks end to end (see below)
make check                         # typecheck, unit tests, production build
make deploy-local                  # the built Cloudflare Worker, running locally on http://localhost:8787
make e2e-worker                    # the end-to-end test against that built Worker
make db-reset                      # wipe the local database and re-seed it
make db-down                       # stop Supabase (data is kept)
```

Run `make` to list every target.

Locally, the AI adapter calls OpenAI directly (`AI_GATEWAY_URL`, `AI_MODEL`, `OPENAI_API_KEY` in
`apps/web/.env.local`). Inside Lovable it keeps using Lovable's AI gateway.

`make e2e` drives the real webhooks, as Postmark and Twilio would:

1. A guest emails in German.
2. The AI classifies the email, and the booking waits for Noor.
3. Noor gets a Swahili SMS.
4. She replies `B<id> 1` (signed like Twilio).
5. The booking is confirmed, and the guest gets a German email.
6. The cron hook runs.

It checks every step in the database and prints the transcript.

## Turborepo commands

```sh
bun install
bun run dev          # apps/web on http://localhost:8080
bun run build        # Cloudflare Worker build in apps/web/.output
bun run test
bun run typecheck
bun run lint
```

No bun? `npx bun@1 install` works too.

Environment: `apps/web/.env` holds the public Supabase URL and publishable key (safe to commit).
Server secrets (`SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY`, `TWILIO_AUTH_TOKEN`,
`PHASE2_ENABLED`) come from the runtime environment, never from the repo.

## Adding UI

- shadcn components: run `bunx shadcn@latest add <component>` from `apps/web`. `components.json`
  routes them into `packages/ui`, so every app shares them.
- Import them as `@turflow/ui/components/<name>`, and helpers as `@turflow/ui/lib/utils`.
- A new app (for example a landing page) imports `@turflow/ui/globals.css` to get the same theme.

## Database

- `packages/db/migrations`: SQL migrations, applied with `bun run --filter @turflow/db db:migrate`
  (needs `LOVABLE_DB_MIGRATION_URL`).
- After a schema change, regenerate the types with
  `bun run --filter @turflow/db gen:types` (needs the Supabase CLI).

## Lovable

This app was generated with [Lovable](https://lovable.dev). Lovable syncs `main` and expects the
app at the repository root, so it cannot edit this monorepo layout. See AGENTS.md.
