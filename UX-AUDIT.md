# Workshop Prep Agent — UX audit

Completed 4 September 2026. **The pack is readable; the journey needs clearer instructions and a stronger next action in each state.** The most useful improvement is to make starting, answering the agent, and downloading for review obvious within the existing page.

Business hypothesis: a facilitator or team may pay for reduced workshop preparation effort. A credible next milestone is one prospective facilitator completing and reviewing a pack without coaching, then discussing a paid pilot. This audit establishes usability observations, not demand, savings or revenue.

## Scope and evidence

Fresh browser captures were saved and reopened for inspection during this run. **Test** means an isolated deterministic runtime on port 3211, separate local storage and no provider credentials. **Live** means read-only inspection of the existing saved model result on port 3210; no new live inference was requested. The test used a 30-minute remote workshop for 10 operations leaders, initially leaving format unanswered. Two test runs exercised preparation and regeneration.

Desktop observations use 1280×720 CSS pixels unless stated; mobile uses 390×844. The earlier saved-result capture used a 1440×900 browser surface with existing zoom yielding 1600×1000 CSS pixels. The brief overview is not used for fold measurements. Evidence below distinguishes browser observations (**O**), source-confirmed behavior (**S**) and inferred user impact (**I**).

## Numbered journey and health

| Step | Health | Observation and evidence |
|---|---|---|
| 1. Arrive and find the start | Needs work | **O:** Clear brief/output grouping, but a large introduction and empty output compete with starting. Prepare begins at document y 957 in a 720px viewport. [Arrival, test](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-audit/01-arrival-test.png>). |
| 2. Describe the session | Mostly healthy | **O:** Audience, outcome, duration, format and constraints accept a practical brief; examples reduce blank-page effort. **I:** Required/optional expectations and the supported AI-workshop scope could be clearer. [Filled brief, test](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-audit/02-brief-test.png>). |
| 3. Understand materials | Needs work | **O:** Expanding reveals three readable fictional references. **S:** They are a fixed library; users cannot upload, edit or select sources. **I:** “A brief and a few materials” can imply supplying your own. [Materials, test](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-audit/03-materials-test.png>). |
| 4. Start and answer missing information | Mixed | **O:** Preparing disables the form; the format question explains why it matters, offers three choices and saves progress. Selecting Remote and continuing succeeds. Focus is on BODY after the async transitions. **S:** Only a missing format triggers this question. [Preparing](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-audit/04a-preparing-test.png>), [question, test](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-audit/04b-clarification-test.png>). |
| 5. Follow preparation and corrections | Mixed | **O:** The working record exposes actual calls and timestamps. A 40-minute draft fails the 30-minute check, is revised, then saved. The detailed explanation is JSON inside a lower-page disclosure; only the last three calls show initially. [Activity, test](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-audit/05-activity-test.png>). |
| 6. Review the pack and its evidence | Mostly healthy | **O:** Proportional agenda timing, item markers and four review tabs organize the output. Agenda, exercise, notes and sources were inspected; ArrowRight moves selection and focus from Agenda to Exercise. Source IDs/titles are readable but do not open their material. [Agenda, live](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-audit/06-saved-result-live.png>), [sources, live](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-audit/06b-sources-live.png>), [notes, live](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-audit/06c-notes-live.png>). |
| 7. Take the output into use | Needs work | **O:** Markdown/JSON downloads sit beneath the pack. Both test endpoints return HTTP 200 attachments; Markdown contains agenda, exercise, notes, sources and checks. **S:** No in-app editor or approval state accompanies “Edit and approve.” **I:** The intended next action is ambiguous. [Download handoff, live](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-audit/06b-sources-live.png>). |
| 8. Prepare another version or return on mobile | Needs work | **O:** Editing the brief leaves the old pack visible until regeneration; regeneration replaces it with a new run. No history selector appears. Mobile has no horizontal overflow, but the saved pack starts at y 1127 after the full brief; tabs use 11px text and 33px height. [Regeneration, test](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-audit/07-another-version-test.png>), [mobile arrival, live](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-audit/08a-mobile-arrival-live.png>), [mobile pack, live](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-audit/08b-mobile-pack-live.png>). |

## Ranked findings

1. **High — The page gives too little direction at the two decisive moments.** Before preparation, the main action is below the first desktop viewport; after completion, the visually dominant action remains “Prepare another version.” Make the brief/action primary before generation and the pack/download primary afterward. On return, lead with the saved pack. This is a hierarchy and wording change, not a new navigation rail. **Evidence: steps 1, 7, 8; impact inferred.**
2. **High — The input and output contract is unclear.** State early that this demo uses three supplied AI-workshop references. Label the handoff “Download Markdown to edit and review”; explain JSON as the structured run record. Preserve the human-review requirement without implying an approval feature. **Evidence: steps 3, 7;** [materials and handoff source](</Volumes/T7 Shield/Projects/workshop-prep agent/app/page.tsx:216>).
3. **High — Async handoffs are not dependable for nonvisual navigation.** The observed scroll changes do not transfer focus to the question or completion. Source shows no dedicated live announcement for these transitions. Add deliberate focus and concise status announcements; screen-reader impact is inferred, not tested. **Evidence: step 4;** [scroll behavior](</Volumes/T7 Shield/Projects/workshop-prep agent/app/page.tsx:175>), [result state markup](</Volumes/T7 Shield/Projects/workshop-prep agent/app/page.tsx:224>).
4. **Medium — “Another version” overstates continuity.** The model receives the current brief, not the previous pack. A new run replaces the current-run pointer. Clearly label regeneration from the brief and explain that the previous pack will leave this view; do not suggest tracked editing. **Evidence: step 8;** [submission](</Volumes/T7 Shield/Projects/workshop-prep agent/app/page.tsx:173>), [new-run initialization](</Volumes/T7 Shield/Projects/workshop-prep agent/lib/agent.ts:40>). Test run changed from `b1cac398…` to `146b36fd…`.
5. **Medium — Inspection requires unnecessary hunting.** Source badges and the Sources list do not open source text. The activity log is useful evidence but weak progress guidance. Keep a short current-action explanation beside preparation and make each source reference reveal its supplied material. Retain raw tool details as optional inspection. **Evidence: steps 5, 6.**
6. **Low — Trust labels need precision.** “Checks passed” can sound broader than timing/content/reference validation; “1 revision” counts the first successful draft. Use specific check wording and “Draft 1.” Mobile tab text is small; larger type/targets would improve comfort. These are clarity/readability findings, not a complete accessibility conformance verdict. **Evidence: steps 6, 8;** [validation](</Volumes/T7 Shield/Projects/workshop-prep agent/lib/validation.ts:54>).

## Preserve and improve

Preserve the editorial typography, restrained cards, source color consistency, proportional timing, useful question explanation and transparent working record. Orange `#f97316` is now the normal third agenda category and matching title marker, with dark `#0f172a` text at **6.369:1** contrast. The cycle is blue, purple, orange, teal, cyan; guidelines are updated. No layout or content redesign was implemented.

Use one state-led workspace: **before preparation**, show the brief, supplied-material explanation and clear Prepare action; **during preparation**, give the current action or question priority with optional activity details; **after completion**, lead with review tabs and Download Markdown, with editing the brief/regenerating secondary. Keep this within the existing page, with no sidebar or progress rail.

**Smallest next implementation slice:** revise the purpose/material/download copy; make the primary action match the current state; focus/announce clarification and completion; make regeneration wording accurate. Preserve the current visual system and backend. Defer uploads, history, an editor and other new features. A focused acceptance check is one unaided brief → question → pack → download journey on desktop and mobile; payment interest remains a separate customer conversation.

## Evidence limits and cleanup

This is an expert audit, not a user study. It does not establish abandonment rates, demand or a WCAG pass. No live latency/error/recovery run, screen-reader session, full keyboard sweep, exhaustive field validation or native download-save dialog was tested. Exercise navigation was observed in the browser DOM without a dedicated screenshot. Deterministic runs verify UI transitions and real tools/storage, not model judgment or arbitrary workshop suitability. The activity capture is the saved record; the preparing capture shows the actual transient UI.

Targeted motion check: with reduced motion enabled, the materials disclosure opens/closes by Enter, intro animation is `none`, and button transition duration is `0s`. Normal motion was preserved. Mobile viewport emulation does not establish real-device behavior. A few captures taken during scroll/reveal or with incorrect viewport framing were replaced; the linked files were visually inspected after saving.

Temporary port 3211 is stopped. Port3210 still responds HTTP 200, its saved live run remains `c805bebb-b92c-4c68-a544-e83305dff792`, and the browser is restored to Agenda with viewport/media overrides cleared. No provider configuration, active data, dependencies or release actions changed. Audit deliverables are this report and the screenshots in `.local/ux-audit/`.

## Selected fresh evidence

First-use arrival — isolated test:

![First-use arrival in deterministic test mode](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-audit/01-arrival-test.png>)

Missing-information handoff — isolated test:

![Format question and continuation controls in deterministic test mode](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-audit/04b-clarification-test.png>)

Saved live pack — sources and download handoff:

![Source list and download handoff in the saved live result](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-audit/06b-sources-live.png>)

Saved live pack on mobile — agenda and orange category:

![Saved live agenda at 390 by 844 CSS pixels](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-audit/08b-mobile-pack-live.png>)

## Implementation addendum — 4 September 2026

The observations and screenshots above preserve the original audit. The focused correction is now implemented locally: starting has a clearer brief/material contract, clarification and completion receive keyboard focus and live announcements, the finished pack leads with Markdown download, and known source references open their exact supplied material. New-run copy explains that the brief starts a fresh preparation without previous-pack context and replaces the current view. Activity remains optional detail. The typography, category colors, orange third segment, proportional agenda and motion preferences remain; no journey rail, uploads, editor or history feature was added.

Changed implementation files are [page.tsx](</Volumes/T7 Shield/Projects/workshop-prep agent/app/page.tsx>), [brand.css](</Volumes/T7 Shield/Projects/workshop-prep agent/app/brand.css>), [MaterialReader.tsx](</Volumes/T7 Shield/Projects/workshop-prep agent/app/components/MaterialReader.tsx>) and [material-reader.css](</Volumes/T7 Shield/Projects/workshop-prep agent/app/material-reader.css>). [DESIGN-GUIDELINES.md](</Volumes/T7 Shield/Projects/workshop-prep agent/DESIGN-GUIDELINES.md>) now records the state-specific hierarchy, handoff wording and accessible interactions.

### Focused proof

- Final affected `npm run typecheck` passed. Isolated deterministic runs exercised brief → format question → corrected 30-minute pack and starting a new run. These checks used separate local storage and no provider credentials.
- Keyboard testing observed focus on the clarification heading and completed-pack heading, selection/continuation, arrow-key tab navigation, source-reader focus and Escape returning to the invoking citation. Live-region text was inspected; an actual screen-reader session was not performed.
- The final pending-start check showed “Starting a new preparation from your brief,” with the previous pack and download controls absent. A temporary 2.5-second response delay in the isolated copy made this short state observable; it was removed afterward. The resulting test run `47cd045c-b83c-4e5a-844d-5a8df3afa77d` completed. The corrected screenshot replaces the previously rejected `03c` capture.
- First-use Prepare was visible at 1280×720 during implementation and at 390×844 on mobile. Refreshed desktop evidence uses measured **1422×800 CSS pixels** because of the browser's existing zoom; its Prepare button spans y 661–706. Refreshed live mobile evidence is **390×844**, with no horizontal overflow, pack beginning at y 316 and Markdown download at y 529–573. Both refreshed desktop captures include the full page header.
- The source reader fit the mobile viewport with reduced-motion animation disabled. The orange category remains `#f97316` with `#0f172a` text; the current live agenda retains its 5/7/11/7-minute proportions.

### Current saved and inspected evidence

| State | Screenshot | Capture context |
|---|---|---|
| First use, desktop | [Open](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-fix/01-first-use-desktop-test.png>) | Refreshed, deterministic test, 1422×800 CSS pixels |
| First use, mobile | [Open](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-fix/02-first-use-mobile-test.png>) | Deterministic test, 390×844; unchanged by the final starting-state correction |
| Clarification | [Open](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-fix/03-clarification-desktop-test.png>) | Deterministic question and continuation controls |
| Starting a new run | [Open](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-fix/03c-new-run-preparing-test.png>) | Corrected pending state at 1280×720; temporary isolated latency as described above |
| Completed pack, desktop | [Open](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-fix/04-completed-live-desktop.png>) | Refreshed live result, read-only, 1422×800 CSS pixels |
| Source reader | [Open](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-fix/05-source-reader-test.png>) | Exact supplied reference in deterministic test |
| Source reader, mobile | [Open](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-fix/05b-source-reader-mobile-live.png>) | Read-only, 390×844, reduced motion |
| Completed pack, mobile | [Open](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-fix/06-completed-live-mobile.png>) | Refreshed live result, read-only, 390×844 |
| New-run wording | [Open](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/ux-fix/07-new-run-test.png>) | Previous-pack label, replacement warning and starting action |

The live browser already showed run `e140bda3-253f-419c-adc7-d40326245ea8` when this closeout inspected it, differing from the original audit's saved run. It was left intact; this correction did not submit any live preparation or restore older data. No provider configuration, backend implementation, dependency or release action was changed by this work. Verification remains an expert UI check, not customer/revenue evidence, an accessibility certification, or a test of live model quality and latency.

### Final build and cleanup

The required production CSS/build check, `next build --webpack`, passed with exit 0 in the isolated copy: compilation, TypeScript and static generation succeeded. It used a clean test/local environment without provider credentials and did not touch the real project's build output. The temporary POST route matches the real source again (`cmp` exit 0).

Temporary PID 11098 was stopped and port 3212 has no listener. Temporary browser tabs are closed; viewport and reduced-motion overrides are cleared. The sole retained preview is [the real app](http://127.0.0.1:3210/), on Agenda with its current saved result intact. Port 3210 remains running under PID 2382 and returned HTTP 200. The approved local UX correction and closeout are complete; no implementation work remains in progress.

## Visible agent work correction — 4 September 2026

Subsequent user feedback identified a remaining problem: preparation still felt abstract. The previous correction put useful evidence behind optional activity details and reduced it to generic completed-action labels. This second approved pass makes the actual agent's work visible while retaining the existing page and review layout. Its business purpose is an understandable hiring/client demonstration; no customer or revenue outcome is claimed.

An always-open **Agent’s work** area now leads the active result card. It separates the real current action from the latest completed outcome, names clickable materials, shows recent completed results and all sources actually read, and places **Draft so far** immediately below when a whole draft returns. Exact validation feedback remains visible during correction. Before a draft exists, the page says so. The format question and Continue action occupy this same area. Completion removes the active-work area, collapses Completed work and restores Review/Download priority.

The optional, nullable `currentAction` field records model/tool phase, step and start time; tool/source identity is included only when known. Existing lifecycle hooks persist action start and clear it after execution, pause, success, failure or timeout. Model generation is labeled **Generating the next response**; `draft_pack` is labeled **Recording the returned draft** because its complete arguments have already arrived. Tool results remain separate completed records. No token streaming, inferred task, percentage or artificially staged progress was introduced. Older saved runs without metadata use a truthful fallback.

Changed source: [AgentWork.tsx](</Volumes/T7 Shield/Projects/workshop-prep agent/app/components/AgentWork.tsx>), [page.tsx](</Volumes/T7 Shield/Projects/workshop-prep agent/app/page.tsx>), [brand.css](</Volumes/T7 Shield/Projects/workshop-prep agent/app/brand.css>), [agent.ts](</Volumes/T7 Shield/Projects/workshop-prep agent/lib/agent.ts>) and [types.ts](</Volumes/T7 Shield/Projects/workshop-prep agent/lib/types.ts>). [MaterialReader.tsx](</Volumes/T7 Shield/Projects/workshop-prep agent/app/components/MaterialReader.tsx>) adds a focus fallback when a transient active-source control disappears. [DESIGN-GUIDELINES.md](</Volumes/T7 Shield/Projects/workshop-prep agent/DESIGN-GUIDELINES.md>) records the final behavior. Typography, source colors, the orange third agenda segment and proportional timings remain unchanged.

### Focused verification and current evidence

[Current-action lifecycle tests](</Volumes/T7 Shield/Projects/workshop-prep agent/tests/current-action.test.ts>) passed **6/6**, covering persisted model/tool starts, known source identity, cleared paused/completed/failed actions, metadata-save failure, limits, stale interruption and a legacy record without the field. The affected existing agent tests passed **12/12**. Tests use isolated storage and injected/scripted models; no paid request occurred. Final affected typecheck passed.

The browser exercised real deterministic tools and storage on isolated port 3213: question → named material reads → Draft 1 → **40-minute agenda fails a 30-minute brief** → Draft 2 at 30 minutes → validation passes → saved. Current action and completed outcomes were observed separately across generation, draft recording, checking and saving. Pending creation showed no previous pack, outcomes or activity. Keyboard input selected Remote and continued; focus moved to Agent’s work, then Review your workshop. Closing a source reader after its active button disappeared returned focus to Agent’s work. Reduced motion disabled the dialog animation. The existing live run `e140bda3-253f-419c-adc7-d40326245ea8`, version 14, has no `currentAction` field and still rendered its saved pack correctly during read-only inspection.

Screenshots below were saved and reopened for inspection. Desktop is **1280×720 CSS pixels** and mobile is **390×844**. Mobile active work had no horizontal overflow and showed the actual draft-recording action, exact timing failure, earlier draft result and named sources. Working captures use temporary latency only in the isolated model/store/create-request paths to make fast real states observable; those delays are not product behavior and do not establish live latency. The correction screenshot is a close view of actual feedback and the provisional draft; the working screenshot includes the full work-area header.

| Evidence | Current screenshot |
|---|---|
| New request; previous work hidden | [Pending start](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/live-work/00-pending-new-run-test.png>) |
| Question within Agent’s work | [Question](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/live-work/01-question-test.png>) |
| Actual active read with named source | [Working](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/live-work/02-working-test.png>) |
| Real 40/30-minute failure and provisional Draft 1 | [Correction](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/live-work/03-correction-test.png>) |
| Mobile work, correction and sources | [Working mobile](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/live-work/04-working-mobile-test.png>) |
| Completed pack in the production test build | [Completed desktop](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/live-work/05-completed-production-test.png>) |
| Completed pack in the production test build, mobile | [Completed mobile](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/live-work/06-completed-mobile-production-test.png>) |

These checks establish state presentation and real deterministic lifecycle behavior. They are not a screen-reader certification, user study or verification of model judgment. Rapid tool phases may occur between polling updates; their completed outcomes remain available without slowing the real agent.

### Final production proof and cleanup

All temporary capture delays were removed from the isolated copy; its `app/` and `lib/` match the final source and contain no capture markers. The required `next build --webpack` passed with exit 0, including compilation, TypeScript and static generation, in a clean test/local environment without provider credentials. The uninstrumented production build then completed browser-created run `b11c05fd-f5ba-4840-9e8c-bc1f8528ba38`: real tool results recorded the failed 40-minute draft, corrected 30-minute validation and saved Draft 2. The saved run has `currentAction: null`; the UI has no active-work block, Completed work is collapsed, focus is on Review your workshop, and Download Markdown is the sole primary action.

The completed screenshots above were saved and reopened at 1280×720 and 390×844. Mobile document width is 390 pixels, with Download Markdown fully visible at y 532–576. These final captures use no artificial latency.

Temporary production PID 17699 is stopped and port 3213 has no listener. The production-test tab is closed and viewport/media overrides are cleared. One obsolete test tab remains on a browser-generated connection error because Browser Use URL policy rejected its close operation; no alternate control path was used. The live preview is retained on Agenda at http://127.0.0.1:3210/. Its dev process is PID 15834 and returned HTTP 200; run `e140bda3-253f-419c-adc7-d40326245ea8` remains completed at version 14 without `currentAction`. No paid inference, provider/model configuration, dependencies, commits or deployment were performed. The approved local implementation and verification are complete.

## Structural redesign addendum — 4 September 2026

The user rejected the previous page hierarchy and requested a complete rethink. This addendum and the current design guidelines **supersede the earlier top-download priority, side-by-side brief/output arrangement and trailing regeneration section**. Earlier observations remain above as history. The local result is a single flow: **brief → actual agent work → workshop review → export**.

The business purpose is a credible demonstration for prospective clients or hiring conversations. Reduced preparation effort could support a paid workshop service; the nearest demand milestone remains a prospective facilitator reviewing the result and discussing a paid pilot. These implementation checks establish neither customer demand nor revenue.

### Implemented hierarchy

- **Start:** a compact heading and brief, one Prepare workshop action, and one disclosure naming the three fixed fictional example materials. Redundant introduction and empty-output cards are removed. The form uses two columns on desktop and one on mobile.
- **Work:** Agent's work keeps real current actions, clarification questions, returned provisional drafts, validation feedback and named source links. It does not invent progress. The input form is hidden while preparation runs.
- **Review:** the completed workshop title becomes the page heading; outcomes, checks and content tabs lead the page on a plain reading surface. New preparation sits beside the heading on desktop and immediately below it on mobile.
- **Edit:** New preparation replaces the review with the compact brief and a visible Back to workshop action. The saved workshop remains intact until submission. Copy explains that a new preparation uses the brief without prior-pack context and replaces the displayed result. Back restores the saved brief and workshop.
- **Export:** Take this workshop with you follows all displayed pack content. Markdown is here; JSON and detailed completed work are inside the initially collapsed Run record below it. There is no oversized restart card after the content.

This pass changes exactly [app/page.tsx](</Volumes/T7 Shield/Projects/workshop-prep agent/app/page.tsx>), [app/brand.css](</Volumes/T7 Shield/Projects/workshop-prep agent/app/brand.css>), [DESIGN-GUIDELINES.md](</Volumes/T7 Shield/Projects/workshop-prep agent/DESIGN-GUIDELINES.md>) and this audit. Existing backend behavior, source reader, live activity, Playfair/DM Sans/JetBrains typography, source colors, orange third agenda segment and proportional timing are preserved.

### Focused verification

Affected typecheck passed during implementation. The final isolated `next build --webpack` passed with compilation, TypeScript and static generation on the final source. Temporary capture latency was removed before that build; isolated `app/` and `lib/` matched the source. No optional backend suite was repeated.

Desktop and mobile testing used separate deterministic test/local storage without provider credentials. The flow covered first use, a format question answered with Remote, actual material reads, a 40-minute Draft 1 failing the 30-minute check, correction and saved Draft 2. The uninstrumented production build completed run `af02ebff-2ea7-45d9-b632-71d749d03f5f` at version 34. Editing the audience from eight to ten facilitators and preparing again produced `94b87e92-933a-4165-b257-56df6c761921` at version 29, Draft 2, with passing 30-minute validation and `currentAction: null`. Pending creation showed the new brief context without the previous pack or exports.

Keyboard checks covered clarification/Continue, focus handoffs, New preparation/Back, arrow-key tabs, source opening/Escape and the Run record disclosure. A concrete mobile issue was corrected: focusing the brief had hidden Back above the viewport. The final handoff focuses the brief without automatic scrolling, then scrolls the page to the top. At 390×844, Back remains visible at y 174–218; the form is present and the saved pack is hidden. Reduced motion disables dialog animation and smooth handoff scrolling. No horizontal overflow was observed. DOM order is pack content → exports → run record → footer; completion has no active-work block.

### Current screenshots, saved and inspected

Full-page evidence was captured by fitting the document within the stated viewport. The mobile completed full-page image shows Facilitator notes; the separate mobile Agenda capture shows its timeline and orange segment.

| State | Current screenshot | Capture |
|---|---|---|
| First use, desktop | [Open](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/layout-redesign/01-first-use-desktop.jpg>) | Full page, 1280×720 |
| First use, mobile | [Open](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/layout-redesign/02-first-use-mobile.jpg>) | Full page, 390×960 |
| Format question, desktop | [Open](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/layout-redesign/03-question-desktop.jpg>) | 1280×720 |
| Active work, mobile | [Open](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/layout-redesign/04-preparing-mobile.jpg>) | 390×844 |
| Completed Agenda, desktop | [Open](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/layout-redesign/05-completed-desktop.jpg>) | Full page, 1280×1400; top action and bottom exports |
| Completed Facilitator notes, mobile | [Open](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/layout-redesign/06-completed-mobile.jpg>) | Full page, 390×1550; top action and bottom exports |
| Completed Agenda, mobile | [Open](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/layout-redesign/06a-mobile-agenda-top.jpg>) | Top, 390×844 |
| Edit brief, desktop | [Open](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/layout-redesign/07-edit-brief-desktop.jpg>) | Full page, 1280×800 |
| Edit brief, mobile | [Open](</Volumes/T7 Shield/Projects/workshop-prep agent/.local/layout-redesign/08-edit-brief-mobile.jpg>) | Full page, 390×1100 |

All completed/edit/first-use captures use the final production test build. Only the question and active-work captures use the isolated development copy with a temporary two-second model delay to expose real transient states. That delay was removed. Rejected and superseded captures were moved out of the evidence directory; nine inspected JPEGs remain.

### Limits and final cleanup

This verifies deterministic interface and tool/storage behavior, not live-model judgment, live latency, a user study, screen-reader conformance or native download-save dialogs. No paid inference, provider changes, dependencies, new backend features or release actions occurred.

Isolated development/production listeners on 3214 and 3215 are stopped. Test tabs are closed and viewport/media overrides reset. The retained live preview is [127.0.0.1:3210](http://127.0.0.1:3210/), dev PID 15834, HTTP 200. Its pre-existing run `57ab79bb-9171-4a2c-a868-fbfb9479f714` remains completed at version 20, updated `2026-09-04T11:32:48.900Z`, with passing 30-minute validation. The user's existing brief-editing state was preserved. This supersedes the older run/tab cleanup snapshot above. The structural implementation, verification and closeout are complete locally.
