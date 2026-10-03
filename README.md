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

## Getting started

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
