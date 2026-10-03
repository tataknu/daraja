# Development

Day-to-day notes for working in the monorepo. The [README](../README.md) covers setup (`make setup`)
and the test commands.

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
- Import them as `@daraja/ui/components/<name>`, and helpers as `@daraja/ui/lib/utils`.
- A new app (for example a landing page) imports `@daraja/ui/globals.css` to get the same theme.

## Database

- `packages/db/migrations`: SQL migrations, applied with `bun run --filter @daraja/db db:migrate`
  (needs `LOVABLE_DB_MIGRATION_URL`).
- After a schema change, regenerate the types with
  `bun run --filter @daraja/db gen:types` (needs the Supabase CLI).

## Lovable

This app was generated with [Lovable](https://lovable.dev). Lovable syncs `main` and expects the
app at the repository root, so it cannot edit this monorepo layout. See [AGENTS.md](../AGENTS.md).
