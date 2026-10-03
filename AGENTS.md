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

## Architecture rules
- All AI calls go through `src/lib/ai-adapter.server.ts` — so a local model can replace it later.
- Workflow/state changes live in `src/lib/engine.server.ts`; booking transitions are enforced by `src/lib/booking-state.ts` — AI never confirms bookings.
- All outbound messages go through `sendMessage()` in the engine — Phase 1 writes to the simulator, Phase 2 swaps the transport.
- Simulator and webhooks (`src/routes/api/public/inbound-*`) both call `handleInbound()` — one code path for real and simulated traffic.
- Tables are read-only to the browser (public SELECT for the simulator); all writes use the server admin client.
