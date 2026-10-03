<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

> [!NOTE]
> Lovable expects the app at the repository root. With the app in `apps/web`, the Lovable editor
> cannot sync this layout; keep Lovable on `main` until the team decides to move off it.

## Monorepo layout (Turborepo + bun workspaces)
- `apps/web` — the Lovable TanStack Start app: UI routes, server functions, webhook routes. Keep routes thin; call into packages.
- `packages/engine` — backend domain logic (server-only, `*.server.ts`). No UI code here.
- `packages/db` — Supabase `Database` types, the service-role admin client, migrations, Supabase project config.
- `packages/ui` — shared design system: shadcn components and the theme (`globals.css`). Add components with
  `bunx shadcn@latest add <component>` from `apps/web`; components.json routes them into `packages/ui`.
- `packages/typescript-config` — shared strict tsconfig.
- Internal packages ship TypeScript source ("just-in-time" packages); the app's Vite build compiles them. No build step.
- Run everything from the root through turbo: `bun run dev | build | test | lint | typecheck`.

## Architecture rules
- All AI calls go through `packages/engine/src/ai-adapter.server.ts` — so a local model can replace it later.
- Workflow/state changes live in `packages/engine/src/engine.server.ts`; booking transitions are enforced by `packages/engine/src/booking-state.ts` — AI never confirms bookings.
- All outbound messages go through `sendMessage()` in the engine — Phase 1 writes to the simulator, Phase 2 swaps the transport.
- Simulator and webhooks (`apps/web/src/routes/api/public/inbound-*`) both call `handleInbound()` — one code path for real and simulated traffic.
- Tables are read-only to the browser (public SELECT for the simulator); all writes use the server admin client (`@turflow/db/client.server`).

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
