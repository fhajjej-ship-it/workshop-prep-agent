# Bounded live workshop tests · 2026-09-04

Owner: this Workshop Prep Agent task. Each live workflow below was separately authorized with a total spend cap of US$1 and local storage only. Three historical Gateway attempts and the first direct Google workflow are sealed after failure. The fresh second direct Google workflow completed successfully and its allowance is sealed as completed.

Latest recorded paid result: the separately authorized **actual UI workflow** completed eight steps and saved a **30-minute workshop pack** after real validator feedback and revision. Token-based estimated cost: **$0.02106675**; actual billed USD is **Unknown**. Its historical allowance is sealed and the saved result remains reviewable/downloadable. The user subsequently authorized repeated user-triggered local testing; the normal app is now enabled without the temporary one-run lock. No additional paid workflow was executed to verify that change. All earlier attempts below remain preserved as historical evidence. See the final section for the browser journey, screenshot and exports.

## Preflight

- The project key authenticated via the read-only Gateway credit endpoint; available balance was **US$5.00** at 01:32 Stockholm. The value of the key was not printed, copied, or included in evidence.
- Exact model: `google/gemini-3.8-flash`; Google endpoint supports tools, reasoning and output limits. Published standard rates: **$0.75 per million input tokens, $3.75 per million output tokens**, no per-request fee. No priority tier, web search, other provider, or fallback model is selected.
- A fresh authenticated, read-only team routing-rule listing returned `rules: []`. No provider settings or budgets were changed.

## Spending bounds

The local guard in `lib/live-test.ts` reserves each request before contacting Gateway and admits only one run ID. It enforces at most **10 model calls across the entire workflow**, at most **32,000 UTF-8 bytes of final serialized model parameters per call**, and **6,000 output tokens per call, including reasoning**. It permits only text/function-tool content, pins Google and the exact model, disables streaming and closes the allowance after completion or failure. The SDK retries are zero. Reported usage outside the envelope, multiple provider attempts or model/provider mismatch close the allowance. Actual tool errors stop the loop; ordinary validator feedback may lead to a model-chosen revision.

Before inference, all **21 local tests passed**, including seven focused guard tests that use mock providers only. The tests verify pre-request reservation, request size, text-only input, single-run ownership, persistent call counts, output limits, failure closure and safe evidence. An independent local audit identified the need to reject multimodal/custom tool-result parts; the final guard includes that restriction.

Conservative calculation using one input token per serialized byte plus 8,000 input tokens per call for framing/tool transformation:

`10 × (40,000 × $0.75 / 1,000,000 + 6,000 × $3.75 / 1,000,000) = $0.525`

An additional allowance counts every previous maximum output again as potentially opaque reasoning context: `6,000 × (0 + 1 + … + 9) × $0.75 / 1,000,000 = $0.2025`.

The full conservative inference bound is **$0.7275**. Adding a further 20% contingency gives **$0.873**, below the authorized $1. This is a bound derived from enforced request limits and published model behavior/prices, not a provider-enforced dollar budget or actual charge. Tool execution and storage are local.

References: [public model endpoints](https://ai-gateway.vercel.sh/v1/models/google/gemini-3.8-flash/endpoints), [Gateway pricing](https://vercel.com/docs/ai-gateway/pricing), [routing rules](https://vercel.com/docs/ai-gateway/models-and-providers/routing-rules), [Google thinking guidance](https://ai.google.dev/gemini-api/docs/generate-content/thinking), [Google output/thinking limit reference](https://github.com/google/skills/blob/main/skills/cloud/agent-platform-inference/SKILL.md#L594-L607).

## Result

**Failed on the first Gateway request with HTTP 403.** The browser submitted one synthetic 90-minute remote workshop for eight senior leaders at 01:39 Stockholm. The app used the real Gateway model path; no deterministic model was substituted. The request was rejected before any workshop tool executed.

| Evidence | Result |
| --- | --- |
| Local run ID | `27e3fb93-c613-4e70-b4ed-3dffa9fb9e62` |
| Requested model | `google/gemini-3.8-flash` |
| Gateway generation ID | `gen_01M1MT7XK0J57BS3YFDM4GT442` |
| Gateway-recorded model/provider | `google/gemini-3.8-flash` / `google`; no BYOK |
| Local status / Gateway finish reason | `failed` / `error` |
| Model request attempts | 1; 5,243 serialized request bytes; 6,000 output-token cap |
| Executed tools / checks / drafts | 0 / 0 / 0 |
| Pack saved for review | No |
| Gateway-recorded input/output/reasoning tokens | 0 / 0 / 0 |
| Gateway-recorded total/upstream inference cost | **$0.00 / $0.00** |
| Post-run credit lookup | $5.00 available; $0.00 total used |
| Single-run allowance | Sealed as failed; further live calls are blocked |

Cost is **provider-reported**, from the read-only generation lookup for this exact generation ID, not the preflight estimate. The dashboard independently displayed the single matching HTTP 403 request with zero cost and no reported usage. No successful model generation, tool loop completion or pack validation is claimed. The detailed cause of the 403 is **unknown**: the visible request details and typed generation lookup did not provide it. There was no retry, provider/model substitution, second workflow, top-up or settings change.

Sanitized evidence: [request reservation ledger](.local/live-test/session.json), [Gateway generation lookup](.local/live-test/gateway-generation.json), [public run record](.local/live-test/run.json). No secret, raw exception payload or model request body is included in the ledger or billing evidence.

## Local changes and verification

- Added `lib/live-test.ts` and seven focused mock tests in `tests/live-test.test.ts`; integrated the guard and stop-on-tool-error behavior in `lib/agent.ts`.
- All 21 tests passed. The final production build and its TypeScript check passed after correcting a TypeScript control-flow narrowing error; that error occurred before any provider request.
- Set only `WORKSHOP_MODE=live` and `WORKSHOP_STORE=local` in the owner-only `.env.local`, preserving the key. `.env.example` was untouched.
- Restarted only the verified project server. Final listener PID 333 has working directory `/Volumes/T7 Shield/Projects/workshop-prep agent` and serves [http://127.0.0.1:3210](http://127.0.0.1:3210). Final mode is **live**, storage **local**, and the browser displays the failed live run. Its consumed allowance prevents another paid workflow.
- No Neon/database work, deployment, publication, provider settings, credits, external messages or unrelated application changes.

The next blocker is resolving the Gateway/Google HTTP 403 for the exact model. Another paid workflow requires separate authorization; this test's ledger must remain sealed.

## Separately authorized second attempt · 2026-09-04 02:04 Stockholm

**Failed once with HTTP 403; the response confirms a free-credit eligibility restriction.** This attempt used the same exact `google/gemini-3.8-flash` model and Google-only routing, with no retries or fallback. The sanitized provider message is:

> Free tier users do not have access to this model. Upgrade to paid credits at [redacted address] for unrestricted access.

The HTTP status is `403`; the Gateway error type is `internal_server_error`; no separate provider code was supplied. This confirms the denial reason for this second request. It does not recover the missing response from the first request.

| Evidence | Result |
| --- | --- |
| Local run ID | `3a35a27c-edc3-4b27-ae30-24bd48a98ad3` |
| Gateway generation ID | `gen_01M1MVPYT7RHECGBAVQ39Z4RKV` |
| Provider timestamp | `2026-09-04T00:04:49Z` |
| Synthetic brief | 30-minute remote workshop for eight fictional senior leaders |
| Requested and recorded model | `google/gemini-3.8-flash` |
| Gateway-recorded provider / BYOK | `google` / false |
| Attempts / request bytes / output cap | 1 / 5,255 / 6,000 tokens |
| Tools / validations / drafts / saved pack | 0 / 0 / 0 / none |
| Gateway-recorded input / output / reasoning tokens | 0 / 0 / 0 |
| Gateway-recorded total / upstream cost | **$0.00 / $0.00** |
| Post-run credit lookup | $5.00 available; $0.00 total used |
| Dashboard total across both attempts | 2 requests; $0 cost; 0 tokens |
| New allowance | Sealed as failed in `.local/live-test-attempt-2` |
| Original evidence | All three original evidence-file SHA-256 hashes unchanged |

Fresh read-only preflight verified the unchanged Google rates, $5 balance and no active inference. The enforced limits and conservative **$0.873** bound remained unchanged. Minimal local changes added sanitized provider error capture and an explicit internal evidence-directory option. The one-use local launcher refused an existing attempt directory; it invoked the existing agent with local storage without reopening the original allowance or restarting the web server. The HTTP API does not expose this directory option.

Focused verification passed: 10 guard tests, 9 agent tests and TypeScript checking. No real model requests were used by those tests. The single real request then failed before any workshop tools ran. The SDK exception did not include a generation ID; it was recovered from the matching dashboard request and independently verified with the read-only generation lookup.

Evidence: [sanitized request ledger](.local/live-test-attempt-2/session.json), [exact Gateway receipt](.local/live-test-attempt-2/gateway-generation.json), [run result](.local/live-test-attempt-2/result.json), [public run record](.local/live-test-attempt-2/run.json), [authorization and prior hashes](.local/live-test-attempt-2/authorization.json).

No purchase, plan upgrade, provider-setting change, model substitution, database work, deployment or further inference occurred. Support escalation was stopped; no support case was submitted. Paid Gateway credits are the provider-stated prerequisite for this exact model. Purchasing credits and any further live workflow require separate authorization.

## Replacement model prepared locally · 2026-09-04

After the second attempt had already finished, the user selected **`zai/glm-5.3-promo-50`**. The subsequent instruction authorized the local switch and focused verification, explicitly excluding another inference call. Both failed Gemini ledgers remain preserved; no replacement allowance was opened.

The public [endpoint catalog](https://ai-gateway.vercel.sh/v1/models/zai/glm-5.3-promo-50/endpoints) verifies the exact slug, sole provider **`digitalocean`**, text input/output, function tools, `tool_choice`, reasoning and output limits. The exact [provider catalog](https://vercel.com/ai-gateway/models/glm-5.3-promo-50/providers) associates `availableToFreeTier: true` with this model and provider. That establishes catalog eligibility, not successful account-specific inference.

Verified promotional prices: **$0.70/M input**, **$2.20/M output**, **$0.13/M cached input**, **$0 per request**. These values already include the promotion and must not be halved again. The [model API reference](https://vercel.com/ai-gateway/models/glm-5.3-promo-50/api) states that reasoning tokens count toward the hard `maxOutputTokens` limit. The [Z.AI documentation](https://docs.z.ai/guides/llm/glm-5.3) supports `low` reasoning; reasoning is always enabled for this model.

The guard retains 10 calls, 32,000 final serialized request bytes per call, 6,000 output tokens including reasoning per call, zero retries, no streaming, no provider tools or model fallbacks, and failure closure. Model and provider constants are shared by configuration, the agent and the guard. Routing is restricted to `digitalocean` and reported provider/model mismatches stop the run.

Using the same 8,000-token framing allowance and extra cumulative reasoning-context reserve:

`10 × (40,000 × $0.70/M + 6,000 × $2.20/M) + 6,000 × (0 + … + 9) × $0.70/M = $0.601`

With 20% contingency, the conservative full-workflow bound is **$0.7212**, below $1. This is derived from enforced request limits and published rates, not a provider dollar budget. Refresh promotional prices before any separately approved inference; undiscounted prices would exceed this bound.

The 19 focused agent/guard tests pass, including exact-model configuration, provider routing, per-call limits, failure closure, separate-ledger sealing and sanitized diagnostics. No live inference was used in those tests. At this preparation stage, the new model's usage, cost and pack result were not measured; the later approved attempt is recorded below.

The production build and its TypeScript check also passed. Only this project's verified loopback server was restarted; PID `2340` serves `127.0.0.1:3210` from the expected workspace. A fresh `/api/config` response reported `mode: live`, `model: zai/glm-5.3-promo-50`, `storage: local`, `ready: true`. This readiness covered local configuration, not permission for inference or proof of successful access. At that point, the original evidence hashes matched, both prior ledgers retained one failed Gemini request, and no GLM run existed. No credentials or provider settings were changed.

## Approved GLM attempt · 2026-09-04 02:17 Stockholm

**Failed once with HTTP 403 before any workshop tool executed.** Fresh preflight at 02:16 Stockholm verified the unchanged promotional prices, $5 available/$0 used, no existing GLM run or active inference, and the unchanged conservative **$0.7212** bound. The separately approved workflow used a new exclusive allowance in `.local/live-test-glm-1`.

Exact sanitized Gateway message:

> Free tier users do not have access to this model. Upgrade to paid credits at [redacted address] for unrestricted access.

HTTP status: `403`. Gateway error type: `internal_server_error`; no separate provider error code was supplied. The actual request was denied, despite the catalog's `availableToFreeTier: true` indication. The reason for that discrepancy remains unknown; catalog eligibility did not establish access for this account/request.

| Evidence | Result |
| --- | --- |
| Local run ID | `eaf51529-15e8-4516-a70c-a7e8ba300009` |
| Gateway generation ID | `gen_01M1MWDS6B0NDE9H9XJ4JHPG5M` |
| Provider timestamp | `2026-09-04T00:17:17Z` |
| Requested and recorded model/provider | `zai/glm-5.3-promo-50` / `digitalocean` |
| BYOK | false |
| Synthetic brief | 30-minute remote workshop for eight fictional senior leaders |
| Model requests / serialized bytes / output cap | 1 / 5,261 / 6,000 tokens |
| Tools / checks / drafts / saved pack | 0 / 0 / 0 / none |
| Provider-recorded input / output / reasoning tokens | 0 / 0 / 0 |
| Provider-recorded total / upstream cost | **$0.00 / $0.00** |
| Post-run balance / total used | **$5.00 / $0.00** |
| New allowance | Sealed as failed |
| Both prior evidence directories | All recorded JSON-file hashes unchanged |

The dashboard showed the exact matching GLM request with DigitalOcean, HTTP 403, no reported usage and $0 total cost. Its generation ID was independently checked through the SDK's read-only generation lookup. There was no retry, second GLM workflow, model/provider fallback, purchase, provider-setting change, support contact, database work or deployment. The application remains configured for GLM with local storage; no successful live pack is claimed.

Evidence: [sanitized ledger](.local/live-test-glm-1/session.json), [Gateway billing receipt](.local/live-test-glm-1/gateway-generation.json), [run result](.local/live-test-glm-1/result.json), [public run record](.local/live-test-glm-1/run.json), [authorization and prior hashes](.local/live-test-glm-1/authorization.json).

## Direct Google connection prepared · 2026-09-04

Authority: prepare the direct Google connection and an empty private key field only. No Google-key request, model call, credit/account check, provider activation or new allowance is authorized.

- Exact direct model: **`gemini-3.8-flash`**, with function calling verified in [Google's model specification](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash).
- SDK package: **`@ai-sdk/google@4.0.63`**, compatible with installed `ai@7.0.92` and `@ai-sdk/provider@4.0.10`. The current `createGoogle` export is used; the older `createGoogleGenerativeAI` alias is deprecated.
- Direct provider identity: **`google.generative-ai`**. Default API base URL: **`https://generativelanguage.googleapis.com/v1beta`**. [Google provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai).
- Private key field: **`GOOGLE_GENERATIVE_AI_API_KEY=`**, added empty at **`.env.local:7`** only because it was absent. All existing environment bytes, including the Gateway key, were preserved. File permissions are `0600`; `.gitignore` covers `.env.local`. No key value is included in this record.
- Active integration: `lib/agent.ts` uses `lib/direct-model.ts`; it no longer imports the Gateway guard or calls its seal function. The historical guard remains separately pinned to its old model/provider IDs so current configuration cannot reinterpret historical ledgers.
- Preparation stops before inference: readiness requires a nonblank direct key and separately reviewed direct test bounds/approval. `doGenerate` and `doStream` unconditionally throw `direct_test_not_authorized` before network or ledger I/O, even if an internal caller supplies a ready configuration. No enabling environment or HTTP parameter was added.

The interface, SDK workflow, local storage, zero retries and source/validation tools remain intact. The direct path retains ordinary loop/output settings, but **no direct Google dollar bound is claimed**. Direct prices, quota/account access, billing, measured usage and costs remain unverified. The prior Gateway budgets and $0 receipts apply only to the historical Gateway attempts. Next step: the user pastes the Google key privately; a later approved test must first establish current direct-provider cost bounds and a new isolated allowance.

Verification: 21 focused agent/direct-provider/historical-guard tests passed; the 11 affected agent/direct tests were rerun after correcting the test environment's required `NODE_ENV` field. Typecheck and production build passed. The direct tests used placeholder credentials and intercepted fetch, recording zero network calls. All 15 JSON evidence files across the three historical attempts retained their original hashes. Final `.env.local:7` remained empty with `0600` permissions. The verified local server is PID `3206`; a fresh `/api/config` response reports `gemini-3.8-flash`, local storage, `ready: false`, and the missing-key plus direct-test-approval blockers. No authenticated Google request, inference, credit check or provider setting change occurred.

## Separately authorized direct Google workflow · 2026-09-04 02:47 Stockholm

**Google access succeeded; the workshop workflow failed on invalid draft-tool input.** After the user saved the private key and authorized one workflow costing no more than US$1, the one-use launcher ran the real SDK agent against direct `gemini-3.8-flash`. Four Google responses succeeded. The model chose and executed three `read_material` calls, then attempted `draft_pack` with `pack.agenda` shaped as `{ "items": [...] }` instead of the required array. The SDK rejected that tool input before its implementation executed:

> Invalid input: expected array, received object

The error path is `pack.agenda`, code `invalid_type`. The existing stop-on-tool-error rule stopped the workflow. There was no `search_materials` execution, saved draft, `validate_pack` call or completed pack. The source-read evidence and rejected candidate remain in the local run record; the candidate is not a validated deliverable.

| Evidence | Result |
| --- | --- |
| Run ID | `10285bbf-9107-4d1d-ba5b-42f4cd4edfc2` |
| Started / finished UTC | `2026-09-04T00:47:05Z` / `2026-09-04T00:47:12Z` |
| Requested / all four reported model versions | `gemini-3.8-flash` |
| Provider / storage | `google.generative-ai` / local |
| Brief | 30-minute remote workshop for eight fictional senior leaders |
| Google requests / successful responses | 4 / 4 |
| Final wire request bytes | 4,172; 5,583; 7,000; 8,487 |
| Executed source reads | `use-case-selection`, `safe-experimentation`, `facilitation-guide` |
| Draft / validation / save executions | 0 / 0 / 0 |
| Google-reported input / output tokens | 4,978 / 828 |
| SDK-normalized reasoning tokens | 0; Google omitted `thoughtsTokenCount` |
| Token-based estimated inference cost | **$0.0068385** |
| Provider-reported USD charge | **Unknown**; direct generation did not return a billing receipt |
| Allowance / retries / additional workflows | sealed failed / 0 / 0 |
| All 15 historical JSON evidence files | SHA-256 hashes unchanged |

Direct Standard rates verified before this run were **$0.75/M input** and **$3.75/M output including thinking**. The estimate uses all four responses' reported usage: `(4978 × 0.75 + 828 × 3.75) / 1,000,000`. It is not a billing receipt, does not claim a free-tier charge, and does not use the Gateway balance. [Direct Google pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash).

The new `lib/direct-live-test.ts` guard required a fresh allowance bound to this run ID, reserved each call before transport, and enforced 10 calls maximum, 32,000 bytes of final native JSON per call, 6,000 output tokens including thinking, low thinking, Standard tier, one candidate, text/local function tools only, and no redirects, retries, streaming, explicit cache or fallback. Including framing and cumulative opaque-history reserves, the conservative bound was **$0.7275**, or **$0.873 with 20% contingency**. This is an application-derived bound, not a Google-enforced dollar budget. Google-reported usage and response IDs were retained before checking the response envelope.

Focused verification: five mocked-fetch guard tests and ten agent tests passed, including stopping an injected live provider after its first tool error. Final TypeScript checking passed. A local re-check of the exact returned candidate confirmed the same array/object schema error; it made no inference request. No app rebuild or server restart was needed for the one-use launcher. The ordinary app preparation gate remains closed, and the launcher refuses an existing evidence directory.

Evidence: [sanitized ledger and response IDs](.local/direct-google-test-1/session.json), [outcome and schema error](.local/direct-google-test-1/outcome.json), [public run](.local/direct-google-test-1/run.json), [result](.local/direct-google-test-1/result.json), [authorization and historical hashes](.local/direct-google-test-1/authorization.json).

The remaining functional blocker is the invalid draft argument shape. No corrective inference, second workflow, provider setting change, purchase, fallback, database work, deployment or support contact occurred. Another live workflow requires separate authorization; this allowance remains sealed.

## Local draft-schema correction fix · 2026-09-04

Authority: local implementation and focused verification only. The prior direct workflow above remains failed and sealed; no new inference was performed.

`lib/agent.ts` now describes `pack.agenda` as an array of agenda items and explicitly instructs the model to correct rejected draft arguments. The stop condition permits only `draft_pack` input-schema errors to return through the SDK's ordinary feedback loop. It identifies the typed `InvalidToolInputError` on the original invalid tool call, matched by tool-call ID; it does not infer error type from a message string. Other live tool errors still stop the workflow.

The strict input schema, deterministic pack validation and save-for-review gate are unchanged. A rejected call executes no draft tool and saves no pack. Correction uses another existing step, without resetting or extending the ten live steps, ten guarded requests, 32,000-byte request cap, 6,000-token output cap, timeout or zero provider retries. The normal inference gate and consumed one-use launcher remain closed.

Two focused regressions in `tests/agent.test.ts` reproduce the observed `{items:[...]}` agenda wrapper. One proves the invalid input is rejected, its error reaches the next model step, no draft exists before correction, and corrected input proceeds through actual validation and save in seven steps. The other repeats invalid input until the existing ten-step cap stops it without a draft or tool execution. Both use a mocked model and temporary local stores, not paid inference.

Verification: **25 affected agent, direct-guard, preparation and validation tests passed**. Final TypeScript checking passed; the two new regressions were rerun after correcting a test assertion's optional message type. All **21 JSON files across the four historical evidence directories** retained their pre-edit SHA-256 hashes. No live completion claim is made for this fix; that remains unverified until a separately authorized workflow.

## Fresh direct workflow completed · 2026-09-04 02:56 Stockholm

**Completed and saved for human review.** The user separately authorized one fresh synthetic workflow with the corrected draft handling, direct Google, local storage and the same US$1 cap. No active workflow existed at launch. A new one-use launcher and allowance used the existing verified limits and pricing evidence without additional price research.

The model executed `read_material` for each of the three provided sources, then `draft_pack`, `validate_pack` and `save_for_review`. All six actions succeeded. The first draft used the required agenda array, passed the validator at exactly 30 minutes, and was saved at revision 1. No schema correction, revision, clarification or search tool ran in this workflow; correction behavior remains supported by the local regression rather than this live trace.

| Evidence | Result |
| --- | --- |
| Run ID | `4f41ed4a-3ce6-4f74-b155-bcb952ca3ec1` |
| Started / finished UTC | `2026-09-04T00:56:19Z` / `2026-09-04T00:56:31Z` |
| Requested / all six reported model versions | `gemini-3.8-flash` |
| Provider / storage | `google.generative-ai` / local |
| Model requests / successful responses / tool executions | 6 / 6 / 6 |
| Drafts / validation calls / save calls | 1 / 1 / 1 |
| Validation | valid; 30 minutes; zero issues |
| Maximum final wire request size | 13,786 bytes of the 32,000-byte cap |
| Google-reported input / output tokens | 10,631 / 972 |
| SDK-normalized reasoning tokens | 0; Google omitted `thoughtsTokenCount` |
| Token-based estimated inference cost | **$0.01161825** |
| Provider-reported billed USD | **Unknown**; no dollar billing receipt returned |
| Allowance / pending calls | sealed completed / 0 |
| Earlier evidence | all 21 JSON-file SHA-256 hashes unchanged |

The estimate uses the existing verified Standard rates: `(10631 × $0.75 + 972 × $3.75) / 1,000,000`. The application-derived conservative allowance remained **$0.873**, below the approved $1; this is not a Google-enforced dollar budget. Actual token-based estimated usage is about **1.16 US cents**. [Direct Google pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash).

Read-only result verification reran the existing strict schema and deterministic validator against the persisted pack: 30 minutes, zero issues, and all cited sources read by this run. The exported JSON run matches the saved public run, and the Markdown exactly matches the existing formatter. Both exports identify a synthetic live-model result requiring human review. Validation proves the implemented timing, structure and reference checks; it does not establish customer results or teaching quality.

Files: [workshop pack Markdown](.local/direct-google-test-2/workshop-pack.md), [workshop pack JSON](.local/direct-google-test-2/workshop-pack.json), [outcome and cost estimate](.local/direct-google-test-2/outcome.json), [request ledger and response IDs](.local/direct-google-test-2/session.json), [public run](.local/direct-google-test-2/run.json), [authorization and historical hashes](.local/direct-google-test-2/authorization.json).

No failure was recorded. There was no provider retry, fallback, automatic additional workflow, provider setting change, deployment or Neon/database operation. The ordinary inference gate remains closed and this fresh allowance is consumed. The next step for this deliverable is human review of the saved pack.

## Actual interface workflow · 2026-09-04 03:08 Stockholm

**The actual local UI created, ran and saved a live workshop.** The user authorized one fresh direct Google workflow through the interface, using the existing US$1 cap and verified bounds. The verified project server was rebuilt and restarted on loopback only; final PID `4996` serves `127.0.0.1:3210` from this workspace. No active workflow existed beforehand.

Browser journey: loaded the app, dismissed an unavailable historical-run restore notice, entered the synthetic eight-leader brief, chose 30 minutes and Remote, and clicked **Prepare workshop once**. The interface disabled the form while preparing. A saved progress snapshot showed three completed source reads while the request was still running. The final view showed **Ready for review**, **Checks passed**, **30 / 30 min**, and two revisions. Agenda, Exercise, Facilitator notes and Sources tabs were inspected. Reload restored the same completed run with **Prepare another version disabled**.

Run: **`d83d57bc-3c2a-47e1-aec2-2bfd355ed604`**. Requested and all eight reported model versions: `gemini-3.8-flash`; provider `google.generative-ai`; local storage. Actual actions were three `read_material` calls, `draft_pack`, `validate_pack`, revised `draft_pack`, passing `validate_pack`, and `save_for_review`.

The first validator call rejected grouped citations in facilitator notes 3 and 6, such as `[facilitation-guide, safe-experimentation]`, as combined unknown/undeclared/unread IDs. The model changed them to separate citations such as `[facilitation-guide] [safe-experimentation]`. Revision 2 passed the existing strict schema and deterministic validator at exactly 30 minutes with zero issues. This is real validation-driven revision; no input-schema correction was needed in this run.

Usage: **18,489 input tokens**, **1,920 output tokens**, and **0 SDK-normalized reasoning tokens** (Google omitted `thoughtsTokenCount`). The estimate is `(18489 × $0.75 + 1920 × $3.75) / 1,000,000 = $0.02106675`, about **2.11 US cents**. Actual billed USD remains **Unknown** because direct responses do not include a dollar receipt. Existing rates and the conservative **$0.873** bound were reused; no extra pricing research occurred. Maximum request size was **19,485 bytes**, below 32,000. The session is sealed completed, with eight successful calls and zero pending calls.

Both **Markdown** and **JSON** links were activated in the browser. The browser did not expose their native save location. Separate read-only HTTP downloads of those exact UI-linked endpoints returned **200** with attachment headers and the expected MIME types; Markdown equals the existing formatter output and JSON equals the saved public run, with synthetic/live/human-review provenance. The saved copies below are those verified HTTP exports. Native browser filesystem delivery is not claimed.

The narrow `lib/ui-live-test.ts` gate reads a process-only authorization directory, atomically claims one run before creation, and uses the existing bounded provider. It allows read/download for the claimed run after sealing but refuses another creation. Five API route files use the gate; `app/page.tsx` refreshes configuration after advance. The final config is `live`, `local`, `ready: false`, with the consumed-allowance message. The existing banner calls this **Runtime unavailable / Setup required**; the completed result remains visible. Four focused mocked gate tests passed, and the final production build/typecheck passed after correcting an optional test assertion message. No guard limits or pack validation were weakened.

One activity-button lookup timed out after the view changed; a fresh DOM snapshot already showed all eight actions and expanded validator feedback. Inspection continued without another workflow. The full-page screenshot had a stitching artifact, so the primary screenshot is the verified viewport capture.

Evidence: [completed interface screenshot](.local/direct-google-ui-test-1/completed-viewport.png), [in-progress screenshot](.local/direct-google-ui-test-1/progress.png), [final DOM](.local/direct-google-ui-test-1/final-dom.txt), [validator feedback DOM](.local/direct-google-ui-test-1/feedback-dom.txt), [Markdown pack](.local/direct-google-ui-test-1/workshop-pack.md), [JSON pack](.local/direct-google-ui-test-1/workshop-pack.json), [outcome](.local/direct-google-ui-test-1/outcome.json), [ledger](.local/direct-google-ui-test-1/session.json), [final config](.local/direct-google-ui-test-1/final-config.json).

All **28 historical JSON evidence hashes** remained unchanged. No duplicate/automatic additional workflow, provider retry, fallback, provider setting change, deployment, external sharing or Neon operation occurred. The saved synthetic pack requires human review.


## Subsequent local enablement and visual pass · 2026-09-04 03:28 Stockholm

The user explicitly removed the temporary one-run restriction for ordinary user-triggered local testing. Normal runs now use direct Google and `.local/runs`; the prior test directory remains a read-only archive. Fresh configuration is `ready: true`, with an enabled **Prepare another version** button and no Setup required banner. Each user-triggered run incurs Google API usage; these historical test envelopes are not a current per-run dollar guarantee.

No new paid workflow was made. Eighteen focused mocked tests, typecheck and the final build passed. The archived pack restored in the browser and its JSON export exactly matched the earlier saved export. All 36 prior JSON evidence files, including this UI test's eight-call completed ledger, stayed unchanged.

Separately, the UI gained Lucide icons, short motion for actual activity/completion/tab changes, reduced-motion CSS and press feedback. The proportional agenda and empty-state bars were removed. [Final local screenshot](.local/ui-polish/completed-viewport.png) · [Enablement proof](.local/repeated-local-testing/outcome.json) · [Visual proof](.local/ui-polish/outcome.json). This work stayed local, with no provider configuration, deployment or Neon changes.
