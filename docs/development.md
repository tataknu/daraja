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

## Deploying to Vercel

The build targets Vercel by itself: on Vercel, Nitro detects the platform and writes Vercel's build
output (Node runtime); elsewhere it falls back to a Cloudflare Worker. `apps/web/vercel.json` pins
the install and build commands for this monorepo.

1. **Database.** Create a Supabase project and apply the migrations in order (they create the
   tables, the demo seed, row-level security and the realtime publication):
   `make db-migrate DB_URL="postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres"`
2. **Vercel project.** Import the repository, set **Root Directory** to `apps/web`, and leave the
   framework preset on "Other" (`vercel.json` sets the commands). To deploy this branch to
   production, set it as the production branch under Settings → Git.
3. **Environment variables** (Production and Preview):

   | Variable                                                                         | Value                                                                             |
   | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
   | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | The new project's URL, publishable (anon) key and project ref; read at build time |
   | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`          | The same URL and keys, for the server; the service key never reaches the browser  |
   | `AI_GATEWAY_URL`, `AI_MODEL`, `OPENAI_API_KEY`                                   | `https://api.openai.com/v1/responses`, `gpt-5.4-mini`, your key                   |
   | `LOVABLE_CRON_SECRET`                                                            | Any long random string; authenticates the timers hook                             |
   | `PHASE2_ENABLED`                                                                 | `false`: the real SMS and email webhooks stay off                                 |

These override the Lovable project values in the committed `apps/web/.env`. Note that the demo
resets its shared data every time someone opens it, so a public deployment suits one presenter at
a time.
