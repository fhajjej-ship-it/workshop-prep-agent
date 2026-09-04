# Local build proof · 2026-09-04

Accountable owner: this Workshop Prep Agent task. Completed within the initial 45-minute pass. This is a standalone synthetic hiring teaser for Farouk's review; employer acceptance and the full role remain unknown.

## Current local state · 2026-09-04 03:28 Stockholm

Repeated user-triggered local live runs are enabled after the user's explicit scope change. The temporary one-run UI claim and inference-blocking wrapper were removed from the normal app path. A fresh `/api/config` reports `live`, `gemini-3.8-flash`, `local`, `ready: true`, with no blockers. The browser shows **Prepare another version** enabled and no Setup required banner. Each new user-triggered run incurs Google API usage; the historical dollar envelope no longer governs normal testing. Existing validation, 10 live steps, 6,000 output tokens per call, 24 tool calls, timeout, zero retries and server-only secrets remain.

The visual pass added Lucide icons and short CSS entrances for real tool rows, completion and tab changes, plus restrained press feedback. The proportional agenda and empty-state bars were removed. Loaded reduced-motion CSS disables new movement and animations; OS preference emulation was not run. Browser inspection found 14 Lucide SVGs, zero chart elements and zero arrival animations on saved activity. Agenda/Exercise switching and the final viewport were checked.

Verification: **18 focused mocked tests, typecheck and production build passed**. An initial build caught a widened `NODE_ENV` type in a test fixture; the annotation was corrected before the successful build. No new paid workflow was run for either change. The historical UI result restored, and its JSON download returned HTTP 200 with content exactly matching the saved earlier export. All **36 historical JSON evidence files** and **8 normal run files** were unchanged. Historical UI runs are read-only; terminal advance cannot call the model or rewrite their evidence.

Serving PID **5772**, verified project directory, build **dRif3xxcFCWePSwnW_oFM**, on [the local app](http://127.0.0.1:3210). Started with ordinary `npm run start`, without the temporary UI gate environment variable. No deployment, provider setting, Neon or private environment-file changes.

Evidence: [enabled-state result](.local/repeated-local-testing/outcome.json), [focused test record](.local/repeated-local-testing/focused-tests.log), [build log](.local/repeated-local-testing/build.log), [visual result](.local/ui-polish/outcome.json), [final screenshot](.local/ui-polish/completed-viewport.png). The earlier actual paid interface test is reported separately below and in [LIVE-PROOF.md](LIVE-PROOF.md).

## Running result of the initial test build

- URL: [Open the local app](http://127.0.0.1:3210).
- Serving command: `npm run start` after a successful `npm run build`.
- Listener verified on `127.0.0.1:3210`; working directory `/Volumes/T7 Shield/Projects/workshop-prep agent`.
- Mode: **deterministic test adapter**, local file storage. No live model call or cloud database connection occurred.
- Final browser run: `9df24ed8-d90e-41f5-9743-4052b901d7a4`.
- Actual persisted result: `completed`, 10 SDK steps, 10 executed tool calls, 3 source reads, 2 draft versions. First validation rejected 100 minutes; the second passed at exactly 90 minutes.

## What is real and what is simulated

The Next.js UI, HTTP requests, Vercel AI SDK tool loop, source searches/reads, deterministic validators, file persistence, clarification resume, saved activity and downloads execute for real. The test adapter scripts the tool choices and supplies fixed workshop text. Its revision is a fixed correction triggered by actual validator feedback. This does not prove live Gemini reasoning, general workshop quality, customer use or business results.

The latest separately approved direct `gemini-3.8-flash` workflow completed **through the actual local UI**, using `@ai-sdk/google@4.0.63` and local storage. Eight real steps read three sources, drafted, received citation feedback, revised, revalidated and saved a 30-minute pack for human review. Revision 2 passed with zero validation issues. Reported usage was 18,489 input and 1,920 output tokens; estimated inference cost was $0.02106675, with actual billed USD Unknown. At test completion its allowance was sealed and new preparation was disabled; the later local enablement above supersedes that temporary restriction while preserving the evidence. See the [saved UI pack](.local/direct-google-ui-test-1/workshop-pack.md), [screenshot](.local/direct-google-ui-test-1/completed-viewport.png) and [LIVE-PROOF.md](LIVE-PROOF.md) for the browser/export evidence and preserved earlier attempts. The Neon/Postgres adapter remains unexercised against a cloud database.

## Focused verification

| Verification | Result |
| --- | --- |
| `npm test` | 14 passed, 0 failed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; page and six API endpoints built |
| Browser walkthrough on final build | Brief → missing format → reload → Remote → validated pack |
| Persisted state | Clarification survived browser reload; an earlier completed run survived server restart |
| Tool feedback | Actual 100-minute rejection followed by a 90-minute pass and save-for-review |
| Downloads | Markdown and JSON returned HTTP 200 with attachment headers and explicit test provenance |
| Mobile | 390px viewport, 390px document width; form, tabs and agenda visually inspected |
| Request origin fix | Same-host invalid body returned 400; unrelated origin returned 403; actual form succeeded |

Tests cover feedback/revision, timing and section failures, invalid/unread/duplicate/misnamed sources, missing-information persistence and resume, loop cap, explicit unavailable live mode, provider failure without fallback or error-detail exposure, concurrent/stale writes, and interrupted-request recovery. The provider-failure test uses a mock that throws; it does not contact a provider.

During the first browser pass, a same-origin check rejected valid requests because Next normalized the internal request hostname. The check now uses the request Host and protocol and was rechecked in the browser. A development hot-reload warning occurred while a hook dependency list was edited; the final review uses the rebuilt local server.

Evidence files:

- [Persisted run summary](.local/proof/summary.json), [full public run](.local/proof/run.json).
- [Test log](.local/proof/tests.log), [typecheck log](.local/proof/typecheck.log), [build log](.local/proof/build.log).
- [Desktop screenshot](.local/proof/desktop.png), [mobile screenshot](.local/proof/mobile.png).
- [Downloaded Markdown pack](.local/proof/workshop-pack.md), [downloaded JSON pack](.local/proof/workshop-pack.json).

## Changed paths

Continued the existing `package.json`, `package-lock.json`, `node_modules` and `lib/types.ts` scaffold. The existing type definitions were preserved. This directory is not a Git repository.

- UI: `app/page.tsx`, `app/layout.tsx`, `app/globals.css`.
- API: `app/api/config/route.ts`, `app/api/materials/route.ts`, `app/api/runs/route.ts`, `app/api/runs/[id]/route.ts`, `app/api/runs/[id]/advance/route.ts`, `app/api/runs/[id]/download/route.ts`.
- Workflow: `lib/agent.ts`, `lib/test-model.ts`, `lib/materials.ts`, `lib/test-pack.ts`, `lib/validation.ts`.
- Persistence/configuration/downloads: `lib/store.ts`, `lib/config.ts`, `lib/http.ts`, `lib/download.ts`, `db/schema.sql`.
- Verification: `tests/agent.test.ts`, `tests/validation.test.ts`.
- Setup: updated `package.json` and `package-lock.json`; added `tsconfig.json`, `next-env.d.ts`, `next.config.ts`, `postcss.config.mjs`, `.gitignore`, `.env.example`.
- Documentation: `README.md`, `PROOF.md`. Next.js also generated `AGENTS.md` and `CLAUDE.md` during startup.
- Local run data and evidence live under `.local/`, excluded by `.gitignore`.

## Remaining setup and boundaries

- Live pack completion through the interface is verified for run `d83d57bc-3c2a-47e1-aec2-2bfd355ed604`; the saved synthetic pack needs human review. All historical direct and Gateway allowances remain sealed; repeated user-triggered local testing is now authorized through the normal app path. See [LIVE-PROOF.md](LIVE-PROOF.md) for the exact browser journey, actual tools, validation, usage and cost estimate. Native browser download storage was not exposed; attachment responses and contents were verified separately after both links were clicked.
- Project `DATABASE_URL` is absent. Neon/Postgres needs a separately approved database, explicit application of `db/schema.sql`, and `WORKSHOP_STORE=postgres`.
- Local storage supports one Node server process. Postgres conditional version writes are the multi-instance path. The app refuses local-file storage on Vercel.
- Validation proves timing, required content and reference integrity; it does not prove factual grounding or teaching quality. Human review remains required.
- No commit, push, deployment, provider activation, cloud provisioning, production-data access or message to Christian occurred. All project work stayed in this workspace.

## 45-second explanation

“This is a synthetic workshop-prep prototype. I give it an audience, objective and time limit. It asks for a missing format and saves that question, so I can return later. The SDK loop reads the provided material, produces a draft and gets deterministic feedback. Here, the 100-minute draft fails, the revised 90-minute draft passes, and the pack is saved for my review. In this run the model decisions are scripted; the tools, checks, persistence and downloads are real. Live Gemini and Neon access are the remaining setup steps.”

## Live-test preflight · 2026-09-04 01:21 Stockholm

**Blocked before model inference.** The project key is present in the owner-only `.env.local`; the key value was not printed or copied. The SDK's read-only `getCredits()` request authenticated successfully and reported **$0.00 available credit**. No live run was created, no model calls were made, and inference spend from this attempt is **$0**. This is not a provider billing receipt for a completed run. There is no live run ID, usage, tool result or pack to report.

The public catalog confirms `google/gemini-3.8-flash` with tool-use support at $0.75 per million input tokens and $3.75 per million output tokens. The connected team's read-only routing-rule listing returned an empty list; its dashboard showed no team budget and an unlimited budget for the `workshop prep agent` key. Sources: [model endpoints](https://ai-gateway.vercel.sh/v1/models/google/gemini-3.8-flash/endpoints), [Gateway pricing](https://vercel.com/docs/ai-gateway/pricing), [routing rules](https://vercel.com/docs/ai-gateway/models-and-providers/routing-rules).

A tighter local request/input/output guard was considered for the authorized $1 run but **was not implemented or activated** after the credit blocker was found. The existing app limits alone are not claimed to enforce a $1 ceiling. Once usable credit is available, the request bounds and cost ceiling must be established before inference.

No environment, application code, provider settings, budgets, credits or database were changed. The existing project server (PID 72242, verified workspace directory) remained on [http://127.0.0.1:3210](http://127.0.0.1:3210); a fresh `/api/config` read confirmed `test` mode, `local` storage and `ready: true`.
