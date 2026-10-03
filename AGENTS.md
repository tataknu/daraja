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
- `apps/web`: the TanStack Start app. `src/routes/*` only wire a URL to a page (head, search params);
  pages and their components live in `src/features/<feature>/` (`demo`, `landing`).
  `src/components/` holds shared pieces (`phone-shell.tsx`) and vendored React Bits (`reactbits/`).
- `packages/engine`: backend domain logic, no UI. Public API in `src/index.server.ts`.
- `packages/db`: Supabase `Database` types, the service-role admin client, migrations, Supabase config.
- `packages/ui`: shared design system (shadcn components + `globals.css` theme). Add components with
  `bunx shadcn@latest add <component>` from `apps/web`; components.json routes them here.
- `packages/eslint-config`, `packages/typescript-config`: shared lint and TS settings.
- Internal packages ship TypeScript source; the app's Vite build compiles them. No build step.
- Run everything from the root: `make check` (typecheck, tests, lint, format, build), `make e2e`.

## Engine (packages/engine/src)
- `engine.ts`: `createEngine({ repo, ai, now })`. `index.server.ts` wires Supabase + the AI gateway.
- Workflows: `inbound.ts` (dedupe, route) → `guest.ts` / `host.ts`; `timers.ts`; `insights.ts`.
- `context.ts`: the shared actions (sendMessage, smsNoor, emailGuest, transition, log).
- Pure logic, unit-tested: `host-replies.ts` (Noor's keypad replies), `booking-state.ts`, `format.ts`.
- `repo.ts` is the only data contract; `repo.supabase.server.ts` holds every query.
- `ai/`: `types.ts` (the `Ai` interface), `tasks.ts` (prompt + schema per task), `gateway.server.ts`.
- Tests use `testing/memory-repo.ts` and `testing/fake-ai.ts`; no database or network.

## Architecture rules
- All AI calls go through `packages/engine/src/ai/`; workflows depend on the `Ai` interface only.
- Booking transitions go through `ctx.transition`, enforced by `booking-state.ts`. AI never confirms bookings.
- All outbound messages go through `ctx.sendMessage` (context.ts). Phase 1 writes to the simulator; Phase 2 swaps the transport there.
- Simulator and webhooks (`apps/web/src/routes/api/public/inbound-*`) both call `handleInbound()`.
- Database access lives in the repo only; workflow modules never import Supabase.
- Tables are read-only to the browser (public SELECT for the simulator); all writes use the server admin client.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
