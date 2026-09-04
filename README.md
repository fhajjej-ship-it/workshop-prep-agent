# Workshop Prep Agent

A standalone, synthetic workshop-preparation prototype for reviewing an agentic workflow. A brief becomes an agenda, exercise and facilitator notes with source references and a downloadable pack for human review. The intended next milestone is a reviewable hiring teaser; employer acceptance and the full role remain unknown. This project establishes no affiliation, customer engagement, deployment or business results.

## Run locally

Dependencies are already installed in this workspace. Use the existing package lock when setting up a fresh checkout with `npm ci`.

```sh
npm run dev
```

Open [http://127.0.0.1:3210](http://127.0.0.1:3210). The defaults are `WORKSHOP_MODE=test` and `WORKSHOP_STORE=local`; no credentials are needed for these adapters. Run only one Node server against the local run directory.

```sh
npm test
npm run typecheck
npm run build
```

See [PROOF.md](PROOF.md) for the recorded test, build, browser and download results.

## How it works

Next.js, TypeScript and Tailwind provide the interface and server routes. Both modes use the same Vercel AI SDK `ToolLoopAgent` and server-side tools:

1. Search and read three provided synthetic text materials.
2. Ask for a missing delivery format and persist the clarification. The request ends; a later answer resumes the saved run.
3. Draft the workshop pack and validate its exact duration, required sections and source references.
4. Revise from validator feedback and save a passing pack for human review.

Zod bounds request and tool structures. The deterministic validator checks that cited material IDs and titles exist and were read by that run. It does not establish factual accuracy, pedagogical quality or suitability. Source content is treated as untrusted data. Tools provide no shell, arbitrary code execution or external write capability, and credentials remain on the server.

Live runs are bounded to 10 model steps and test runs to 14, with 24 executed tool calls across requests, 6,000 output tokens per call, and a 90-second timeout per generation request. Provider retries are disabled. Repeated user-triggered local live testing is enabled; each run incurs Google API usage. Temporary one-run claims and dollar allowances no longer gate the app. Historical bounded-test ledgers remain sealed and preserved. The direct result and historical Gateway receipts are retained in [LIVE-PROOF.md](LIVE-PROOF.md). The activity view comes from executed tool records, not generated reasoning animation.

In **test mode**, a conspicuously labeled scripted model adapter drives the real SDK loop. Its fixed first draft exceeds the brief by ten minutes; actual validator feedback triggers a fixed correction. This proves workflow mechanics, not model intelligence or live model generation.

In **live mode**, the model is direct **`gemini-3.8-flash`** using **`@ai-sdk/google@4.0.63`** and Google's `google.generative-ai` provider. An earlier separately approved programmatic workflow completed six real steps: three source reads, draft, validation and save for review. Its first draft passed all implemented checks at exactly 30 minutes. Usage was 10,631 input and 972 output tokens: **$0.01161825 estimated**, with actual billed USD **Unknown**. Review that [saved live workshop pack](.local/direct-google-test-2/workshop-pack.md). The active path has no AI Gateway fallback. See [live evidence](LIVE-PROOF.md), [Google's model specification](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) and [AI SDK Google provider](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai).

The subsequent **actual interface test** also completed: one Prepare click produced eight live steps, including real citation feedback, revision and revalidation. The 30-minute pack remains visible after reload, and all four review tabs work. Both download links were activated; separate HTTP export checks returned matching attachments (the browser's native save path was not exposed). Usage was 18,489 input and 1,920 output tokens, **$0.02106675 estimated**, actual billed USD Unknown. [Latest UI pack](.local/direct-google-ui-test-1/workshop-pack.md) · [Screenshot](.local/direct-google-ui-test-1/completed-viewport.png).

The local fix states the required agenda array shape and lets the SDK feed rejected `draft_pack` input back to the model for correction within the existing ten-step limit. Invalid inputs still cannot execute or save a draft; execution errors still stop live runs. Input-schema correction is demonstrated by the mocked regression. The latest UI workflow demonstrated real correction of validator feedback about source citations.

The user supplied the Google AI Studio key privately in `GOOGLE_GENERATIVE_AI_API_KEY` in `.env.local`; the file has owner-only permissions and is covered by `.gitignore`. The historical `AI_GATEWAY_API_KEY` is preserved and unused by the active connection. With live mode and local storage configured, the direct provider is ready for repeated user-triggered runs. The temporary approval manifest and sealed allowance no longer block new preparation. No automatic paid run was used to verify this change; mock tests cover the repeated-run path.

## Storage and setup blockers

The local adapter persists run snapshots, conversation context, clarification and tool results in `.local/runs`. It uses in-process write serialization, version checks and atomic file replacement. It supports one Node server process; it is not suitable for multiple server processes or durable Vercel hosting.

The Postgres adapter supplies the future Neon/Postgres deployment path with conditional versioned writes. No cloud database was provisioned, no migration was applied and no live database connection was verified. `db/schema.sql` is a future manual setup step against a separately approved database; the application does not apply it automatically.

The app uses live mode with local storage. Direct Google access, token usage and successful pack completion through the earlier UI test are verified; actual billed USD remains unknown. All historical direct and Gateway allowances remain sealed. **Prepare another version** is available for new user-triggered runs, while the historical UI result remains readable and downloadable without modifying its evidence. Historical Gateway balances and receipts do not apply to direct Google. `DATABASE_URL` remains absent. For Postgres, configure `WORKSHOP_STORE=postgres` with the database URL after explicitly applying the schema. `.env.example` lists settings without secrets. Vercel is a future hosting option, not the agent implementation; Codex is the development tool, not the application runtime. Public hosting is outside this local build's scope.

## Interface polish

Lucide icons accompany actual tool activity, review controls and downloads. Coordinated page entrances begin after saved-state restoration, and mounted review content reveals in staggered rows. Materials and tool disclosures animate opening and closing to their measured content height. The original navy-to-teal agenda retains widths based on saved durations, with a single 750ms reveal from the left when its tab mounts; the detailed timed list remains below it. Reduced-motion preferences remove entrance animations, transforms and smooth scrolling and make disclosures immediate.

## Short demo

1. Explain: “This is synthetic test mode. The tool loop and validation execute locally; the model decisions are scripted.”
2. Enter an executive audience, an experiment-selection objective and a 90-minute duration. Leave delivery format unanswered.
3. Start the run. Show the inline format question; reload to demonstrate saved clarification, then answer it.
4. Inspect the material reads, the failed 100-minute draft check, the revised 90-minute check and the save-for-review event.
5. Review the test pack and download Markdown or JSON. Explain that a human still decides whether its content meets the brief. For the separately recorded live result, open the saved live workshop pack linked above; database access remains unverified.
