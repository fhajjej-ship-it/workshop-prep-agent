# Workshop Prep Agent

A standalone workshop-preparation app. A brief and selected materials become an agenda, exercise and facilitator notes with source references and a downloadable pack for human review. Three fictional example references remain available for trying the workflow. This project establishes no affiliation, customer engagement, deployment or business results.

## Explore the example

Home offers **Explore an example workshop**, opening `/example`: a bundled, read-only Northlight AI pilot selection pack from a completed model run using fictional materials. Its agenda, exercise, sources, saved review, PDF and Word downloads are available without a model call or database lookup. Browsing it does not add a workshop to the visitor's library.

**Try this example** opens `/?view=brief&example=ai-adoption` with its brief and two sources selected. The example draft is kept separately from an existing new-workshop draft. Only **Prepare workshop** starts a fresh run through the normal workflow; the result can differ from the saved example. The original example remains unchanged.

## Shared demo allowance

Set `WORKSHOP_DAILY_GENERATION_LIMIT=20` to admit up to 20 new live preparations and reruns per UTC day across all visitors. The brief shows the configured allowance; refused starts return HTTP 429 with a reset time and `Retry-After`, while the existing brief stays editable. `0` pauses new starts. An unset variable preserves existing behavior for a staged rollout; invalid values block generation rather than silently disabling the limit. Test mode is not charged.

Each accepted preparation reserves one slot before its run record is created. Clarification and continuation of that admitted run do not reserve again, including after midnight or when new starts are paused. Failed or deleted runs do not refund slots. An unsuccessful write after reservation can conservatively consume a slot; this prevents retries from exceeding the allowance. Older unfinished runs without a reservation pass the gate before they can advance. This bounds **new preparation starts**, not exact daily spend: already admitted work can continue later within its existing per-run limits.

For an existing Postgres database, apply the additive `db/daily-generation-allowance.sql` migration **before** enabling the environment variable. Fresh databases can use `db/schema.sql`. The app never applies migrations automatically. The daily ledger contains only UTC dates and run identifiers, separately from workshop records. Postgres serializes reservations across server instances; local storage persists its ledger under `.local/generation-allowance` and supports one Node process. Storage errors block new admissions. Saved-workshop reads, examples, copying a completed pack, and downloads never depend on this ledger.

Rollout: apply the additive migration, set `WORKSHOP_DAILY_GENERATION_LIMIT=20` in Vercel, then deploy this code. Rollback: unset the variable and redeploy; retain the ledger so re-enabling the same day does not reset usage. No existing workshop or source needs migration.

## Run locally

Dependencies are already installed in this workspace. Use the existing package lock when setting up a fresh checkout with `npm ci`.

```sh
npm run dev
```

Open [http://127.0.0.1:3210](http://127.0.0.1:3210). Fresh-checkout defaults are `WORKSHOP_MODE=test` and `WORKSHOP_STORE=local`; no credentials are needed for these adapters. This workspace's private `.env.local` configures live Google generation and Neon Postgres storage. Run only one Node server against any local run directory.

```sh
npm test
npm run typecheck
npm run build
```

See [PROOF.md](PROOF.md) for the recorded test, build, browser and download results.

## How it works

Next.js, TypeScript and Tailwind provide the interface and server routes. Both modes use the same Vercel AI SDK `ToolLoopAgent` and server-side tools:

1. Confirm the brief. Ask for a missing delivery format and, when necessary, one targeted question about the outcome, constraints or sources. The question and answer persist across a pause or reload.
2. Search and read the materials selected for this workshop: uploaded documents, pasted text or the fictional examples.
3. Build a pack with an agenda, facilitator notes and a self-contained exercise: actual scenario/input, instructions, expected participant output, a worked sample response, debrief and duration. Link the exercise to the agenda section that hosts it. Record source-backed claims with supporting passages separately from proposed activities.
4. Check and improve. Deterministic checks validate total duration, the exercise's duration against its linked agenda section, required fields, references and that quoted passages occur in the selected sources. A separate content-review call assesses goal alignment, audience fit, constraints, grounding and exercise completeness. For revisions, it also receives an exact snapshot of the parent pack to compare requested changes and preservation requirements. It can request one correction; persistent issues or a reviewer failure leave a stopped draft with the reason visible.
5. Save for human review. A draft that passes both checks is saved automatically, without another model decision. Its content review must match the current draft version and content fingerprint.

Zod bounds request, tool and review structures. Deterministic checks establish structural and passage integrity, not whether a claim is supported in meaning. The separate content review is model-assisted judgment, not certification of accuracy, teaching quality or suitability. Source content is treated as untrusted data. Tools provide no shell or arbitrary code execution; run data is saved through the configured storage adapter, and credentials remain on the server.

From a saved pack, **Workshop brief** in the step navigation returns to Step 1 for that same workshop. **Edit brief and sources** near the top of the result opens the same editing step. Update the audience, goal, timing, format, constraints or selected materials, then choose **Prepare again**. Step 2 displays preparation and requests any needed clarification; Step 3 shows the updated pack. This creates a new version under the existing workshop card, with its parent still accessible, rather than creating a separate workshop. **New workshop** remains the way to start an unrelated workshop.

Edited brief fields are authoritative during drafting, timing validation and content review. Changed sources are saved only with the new version and require fresh reads and checks. Earlier packs and their source snapshots remain unchanged. Feedback-only revisions retain their parent's brief and sources. A stopped revision keeps any draft it produced, and the previous version remains accessible. The old source editor below the completed pack is no longer the entry point for updating a workshop.

While editing an existing brief, choose **Workshop pack** in the steps or **Back to saved pack** to return to its saved result without preparing again. Any unfinished edits remain in the tab's draft; they do not change the saved pack until a new preparation is submitted.

## Add your materials

In the workshop brief, choose **Upload PDF or text** or **Paste text**. Open a selected material to review its text before preparing. For a new workshop, adding the first custom material replaces the selected examples; examples can also be selected individually. When editing a saved workshop, adding a material preserves the current selection until you explicitly remove a source. Up to three materials may be selected, with 20,000 characters per source and 40,000 in total. PDF, TXT and Markdown files are limited to 3 MB; PDFs may have up to 20 pages. Password-protected PDFs and scans without readable text are rejected with guidance to paste the text instead. Documents are never silently truncated.

PDF text is extracted locally using `pdf-parse`; uploading does not call the model. When preparation starts, the selected text is saved with the run through its configured store. Original uploaded files are not retained. The agent searches, reads and validates against that saved source set, and reopened results show the same sources even when another brief uses different materials. Older runs without source snapshots still use the original example references. In test mode, the scripted fixture exercises custom-source persistence and citation wiring; it does not interpret the documents or prove model-generated content quality.

Unadded pasted text blocks preparation until it is added or explicitly discarded. When browser session storage is available, unfinished briefs, selected materials, feedback and pending pasted text survive navigation and reload in that tab. The new-workshop draft and each saved workshop's edit draft are stored separately. These drafts are not saved to the server or shared across devices. Clarification answers and format selections stay in the form during submission and remain available to retry after a failed request. A new question starts with empty input.

Live runs are bounded to 10 model steps and test runs to 14, with 24 executed tool calls across requests and a three-minute timeout per preparation request. Content-review calls share the model-step budget and remaining request time. Drafting calls allow up to 6,000 output tokens; each review allows up to 2,200, with at most two reviews and one content-review correction. Provider retries are disabled. Each user-triggered live run incurs Google API usage. Temporary one-run claims and dollar allowances no longer gate the app. Historical bounded-test ledgers remain sealed and preserved. The direct result and historical Gateway receipts are retained in [LIVE-PROOF.md](LIVE-PROOF.md). The activity view comes from executed tool and review records, not generated reasoning animation.

In **test mode**, a conspicuously labeled scripted model adapter drives the real SDK loop. Its fixed first draft exceeds the brief by ten minutes; actual validator feedback triggers a fixed correction. The content reviewer also returns explicitly scripted responses. Feedback is recorded, but the fixed fixture does not interpret it. These runs prove workflow mechanics, not model intelligence, semantic review quality or live model generation.

The September 4 workflow regression pass finished with 70 passing automated tests, a passing typecheck and an optimized production build in an isolated copy. Thirteen adversarial cases cover rejected or malformed reviews, reviewer errors, stale approvals, step exhaustion, absent exercise materials, fabricated passages, clarification and revision preservation. Isolated browser checks also covered pending input, reload/resume, stopped revisions and recovery from the stopped draft. These checks used temporary local storage and scripted or mocked model responses; they made no paid model calls. The live receipts below predate this content-review and feedback-revision workflow and do not verify its model judgment.

The subsequent quality-fix pass increased the suite to 79 passing tests, with passing typecheck and production build. New regressions cover parent-pack comparisons, exercise-slot limits, legacy exports, clarification input retention, paused-revision navigation and stopped-draft inspection. Isolated browser tests reproduced submission failures, verified answer retention in both flows, restored paused/ready revisions after reload and completed recovery from a stopped draft. The existing real workshop and its exports were unchanged. This pass also made no paid model calls; live review accuracy remains unmeasured.

In **live mode**, the model is direct **`gemini-3.8-flash`** using **`@ai-sdk/google@4.0.63`** and Google's `google.generative-ai` provider. An earlier separately approved programmatic workflow completed six real steps: three source reads, draft, validation and save for review. Its first draft passed all implemented checks at exactly 30 minutes. Usage was 10,631 input and 972 output tokens: **$0.01161825 estimated**, with actual billed USD **Unknown**. Review that [saved live workshop pack](.local/direct-google-test-2/workshop-pack.md). The active path has no AI Gateway fallback. See [live evidence](LIVE-PROOF.md), [Google's model specification](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) and [AI SDK Google provider](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai).

The subsequent **actual interface test** also completed: one Prepare click produced eight live steps, including real citation feedback, revision and revalidation. The 30-minute pack remains visible after reload, and all four review tabs work. Both download links were activated; separate HTTP export checks returned matching attachments (the browser's native save path was not exposed). Usage was 18,489 input and 1,920 output tokens, **$0.02106675 estimated**, actual billed USD Unknown. [Latest UI pack](.local/direct-google-ui-test-1/workshop-pack.md) · [Screenshot](.local/direct-google-ui-test-1/completed-viewport.png).

The local fix states the required agenda array shape and lets the SDK feed rejected `draft_pack` input back to the model for correction within the existing ten-step limit. Invalid inputs still cannot execute or save a draft; execution errors still stop live runs. Input-schema correction is demonstrated by the mocked regression. The latest UI workflow demonstrated real correction of validator feedback about source citations.

The user supplied the Google AI Studio key privately in `GOOGLE_GENERATIVE_AI_API_KEY` in `.env.local`; the file has owner-only permissions and is covered by `.gitignore`. The historical `AI_GATEWAY_API_KEY` is preserved and unused by the active connection. With live mode and Postgres storage configured, the direct provider is ready for repeated user-triggered runs. The temporary approval manifest and sealed allowance no longer block new preparation. No automatic paid run was used to verify this change; mock tests cover the repeated-run path.

## Storage

The app runs locally with `WORKSHOP_STORE=postgres` and a private `DATABASE_URL`. A dedicated `workshop-prep-agent` Neon Free database in Frankfurt was provisioned through Vercel Storage, with optional Neon Auth disabled. The existing `db/schema.sql` was applied explicitly. The running app reports live mode, Postgres storage and ready configuration; new runs are stored in Postgres with conditional versioned writes.

Older runs in `.local/runs` remain readable and downloadable from their original local files. Unfinished, non-archived runs can resume in that same local store when their model and mode match the current configuration; changing storage does not migrate them. The local adapter preserves snapshots, conversation context, clarification and tool results using in-process write serialization, version checks and atomic file replacement. It supports one Node server process. The separately recorded historical UI-test archive stays read-only, and its model receipts and sealed allowances remain preserved.

Actual Neon persistence was verified with a scripted 10-step workflow: clarification paused and resumed, an invalid draft was corrected to revision 2, validation passed and the result was saved. A fresh database connection returned the same serialized completed run, and a stale-version write was rejected. Running-app HTTP reads and JSON/Markdown exports passed for both the new Neon test run and a historical local run; the checked historical local file's hash was unchanged. These storage checks used scripted model decisions and made no real model call. The earlier direct Google and Gateway receipts above remain the evidence for their separately recorded model attempts; actual billed USD remains unknown.

`.env.example` documents the offline defaults and optional live/Postgres settings without secrets. For another database, configure `WORKSHOP_STORE=postgres` and `DATABASE_URL` after explicitly applying `db/schema.sql`; the application does not apply the schema automatically. Vercel Storage provisions the database separately from the application deployment.

## Vercel production configuration

The Vercel project is linked to this repository's `main` branch. Production uses `WORKSHOP_MODE=live`, `WORKSHOP_STORE=postgres`, and the explicit `WORKSHOP_ALLOW_HOSTED_LIVE=true` opt-in. Set `DATABASE_URL` and `GOOGLE_GENERATIVE_AI_API_KEY` as production secrets in Vercel; keep their values out of Git. Without the hosted opt-in, live preparation remains blocked on Vercel. Local development does not need the hosted opt-in.

Use the Next.js framework preset, `npm ci` for installation and `npm run build -- --webpack` for the production build. `vercel.json` selects Frankfurt for functions, matching the existing Neon database region. The preparation route allows four minutes for the three-minute agent request plus final persistence. Interrupted runs retain saved work and are reported as stopped after the recovery threshold. These per-run limits are complemented by the optional shared daily generation allowance below. The app does not implement private user accounts. Browser history and management cookies are scoped to the site's origin, so local browser history does not transfer automatically to the deployed site.

## Workshop library

Home shows workshop cards with the saved title, audience, duration, format, status and update time. **New workshop** starts a brief; an unfinished brief changes that card to **Continue brief**. Inside a brief or pack, **Back to workshops** returns to this library. There is no separate workshop sidebar or duplicate new-workshop action inside the pack. The library uses this browser's existing ten-entry history, not a shared database listing or user account.

Every card has a menu with **Remove from this browser**, which only clears this library entry. Readable completed or stopped packs also offer **Duplicate**: enter the copy's name, then choose **Create copy**. This saves an independent workshop with its own card and management permission, using the selected version's exact brief, materials, content and existing checks. Copying does not call the model, and it does not turn a stopped draft into a completed pack. The copied pack identifies its origin and explains that its checks were copied. Cancel creates no record. The card menu offers **Rename** and **Delete workshop** when this browser can manage that record. Rename changes the library name without changing the reviewed pack or export contents. Delete requires confirmation and permanently removes the selected record from its actual local/Postgres store; the card is removed only after the server confirms deletion. Separate revisions and files already downloaded remain. Failed or stale requests keep the dialog and workshop available for an explicit reload and retry.

New runs, revisions and copies receive a private browser-management cookie, with only its hash stored on the run and omitted from public responses and exports. PATCH/DELETE require that browser's authority, a matching Origin and the current record version. Duplicate requires a matching Origin and the selected record version; a readable view-only workshop can be copied, while the original's management permission remains unchanged. Unowned legacy records can be managed only on an exact loopback development server without hosted markers; archived test evidence stays read-only. Losing the cookie loses management access to owned records. This is a demo management boundary, not private accounts: existing workshop reads and the preparation/advance flow retain their earlier access behavior. Cards and mutations were verified locally with temporary records, mocked Postgres and isolated browser responses; this change did not modify real saved workshops or call a model.

## Interface polish

Lucide icons accompany actual tool activity, review controls and downloads. Coordinated page entrances begin after saved-state restoration, and mounted review content reveals in staggered rows. Materials and tool disclosures animate opening and closing to their measured content height. The original navy-to-teal agenda retains widths based on saved durations, with a single 750ms reveal from the left when its tab mounts; the detailed timed list remains below it. Reduced-motion preferences remove entrance animations, transforms and smooth scrolling and make disclosures immediate.

## Short demo

1. Explain: “This is synthetic test mode. The tool loop and validation execute locally; the model decisions are scripted.”
2. Enter an executive audience, an experiment-selection objective and a 90-minute duration. Leave delivery format unanswered.
3. Start the run. Show the inline format question; reload to demonstrate saved clarification, then answer it.
4. Inspect the material reads, the failed 100-minute draft check, the revised 90-minute check, the explicitly scripted content review and the automatic save-for-review event.
5. Open Exercise to inspect its scenario, expected output and sample answer. Return to **Workshop brief**, edit the brief or sources, and choose **Prepare again** to create a new version in the same workshop. Inspect the preserved previous version. In test mode the scripted adapter records feedback without interpreting it.
6. Review the test pack and download PDF for sharing or Word for editing. Markdown and JSON remain available under the run record. Explain that a human still decides whether its content meets the brief. For the separately recorded live result, open the saved live workshop pack linked above. Neon persistence and exports were verified separately with the scripted workflow described under Storage.
