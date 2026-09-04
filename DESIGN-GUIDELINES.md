# Workshop visual guidelines

## Measured reference

Browser measurements from the [Varick discovery interface](https://demo.varickagents.com/client-003/discovery), captured on 4 September 2026:

- Canvas `#f8fafc`; white cards; text `#0f172a`; navy `#1e3a5f`; secondary `#64748b`; borders `#e2e8f0`.
- Cards: 12px corners, 16px padding, no shadows. Main area: 1280px maximum width, 40px padding.
- H1: Playfair Display, weight 500, 30px/36px, −0.6px tracking.
- Body: DM Sans, 14px/22.75px. Section headings: DM Sans, weight 500, 14px/20px.
- Utility labels: JetBrains Mono, 10px, 0.5px tracking. Hover transitions: 150ms.
- Measured system-icon fills: SAP `#0070AD`, Manhattan `#3D1A6E`, Blue Yonder `#4FC3F7`, Ariba `#008B8B`, Supplier Portal `#6B7280`, Excel `#217346`, Outlook `#0078D4`. The heatmap uses varied red, amber, orange, blue, violet and green tints.

## Workshop adaptations

Self-host these fonts through `next/font/google`. Use a 36px desktop/28px mobile serif hero and 28px/25px generated-pack title. Keep section headings compact and sans serif, content 13–14px, and control corners 8px. Let the current preparation state determine the page hierarchy as described below.

Use navy actions, green for validated/saved status, amber for questions/validation warnings, and warm red for errors. Category colors below serve agenda and source identification independently of status. Theme rules live in `app/brand.css`.

The workshop adapts the reference icon palette with softer purple and darker teal for balance and text legibility. Its Procurement category also supplies strong orange `#f97316` (observed as a 12.5% tint with an orange edge). Agenda categories cycle blue → purple → orange → teal → cyan after five segments, so orange is visible in the normal third segment. Match title markers to their segments; preserve saved widths and times. Keep ordinal and unit text at opacity 1. Orange identifies an agenda item only; validation warnings retain labeled amber states.

| Role | Text | Background | Contrast |
| --- | --- | --- | --- |
| Agenda 1: blue | `#ffffff` | `#0070ad` | 5.356:1 |
| Agenda 2: purple | `#ffffff` | `#6f42a8` | 6.952:1 |
| Agenda 3: orange | `#0f172a` | `#f97316` | 6.369:1 |
| Agenda 4: teal | `#ffffff` | `#007f83` | 4.813:1 |
| Agenda 5: cyan | `#0f172a` | `#4fc3f7` | 8.911:1 |
| Source: `use-case-selection` | `#005c91` | `#e8f3fb` | 6.342:1 |
| Source: `safe-experimentation` | `#63328c` | `#f4edfb` | 7.759:1 |
| Source: `facilitation-guide` | `#075a78` | `#e6f7fe` | 6.964:1 |

Calculated sRGB contrast at full opacity exceeds 4.5:1 for all eight pairs. Map source tags and icons by stable source ID, regardless of list order; unknown IDs stay neutral.

Use the original separated numbered agenda blocks with 4px gaps and serif durations. Show the full activity titles, original descriptions and source chips directly in the timed rows below, with color markers matching their timeline segments. Preserve saved content, timing and colors.

Preserve disclosure motion at 350ms, coordinated entrances at 620–680ms and tabs at 340ms. Reveal agenda segments sequentially from left to right: each segment reveals over 750ms with a delay of its zero-based index multiplied by 750ms. Keep segment widths proportional to agenda minutes. Respect reduced motion, including scrolling; show all segments immediately when reduced motion is requested.

## Preparation and review hierarchy

Use one reading column in every state. This hierarchy supersedes the earlier top-of-pack downloads, side-by-side brief/output layout, and after-content brief-summary/new-run card. Keep a visible **New preparation** entry beside the top workshop heading whenever a saved or active run exists; disable it while the run is locked.

- First use: show one compact brief, with two columns of fields on desktop and one on mobile. Keep required audience, outcome and time fields clear; constraints are optional and the format can be answered next. Include the three fixed demo materials in one disclosure and a single **Prepare workshop** button. Do not show a separate What you’ll get card, an empty output panel, or a duplicated brief summary.
- In progress or awaiting input: lead with the always-open Agent’s work area and its five workshop-preparation steps: **Confirm brief**, **Review references**, **Build workshop pack**, **Check and improve**, and **Save for review**. Distinguish the next unmet workflow milestone from the actual current tool action. Keep clarification and Continue preparation in that same work area when an answer is needed. Show compact recent recorded steps in chronological order, with expandable earlier steps and sources. Show a returned provisional draft below, with raw activity collapsed. Do not add a second brief card after the work.
- Saved pack: use the actual workshop title as the main heading, with audience, duration and format context. Lead with the outcome, exact checks, existing section tabs and workshop content. Put the export footer after the content as the final workflow section: **Download Markdown**, followed by one collapsed **Run record**, which contains the full readable history of recorded steps and corrections, raw tool activity and the JSON download. Do not add a Completed work bar above the result, place exports above the workshop content or add a new-preparation card after it.
- New preparation: selecting the heading entry replaces review with the same compact brief form and **Back to workshop**. Retain the saved run until the new brief is submitted; do not show a competing form and old pack together. Keep **Prepare workshop** as the single submission action. Explain that it starts a new run from this brief without the previous pack as context and replaces the displayed pack. To keep a copy first, the user can go Back to workshop and download the current pack from its footer. Do not describe this as editing or revising the existing pack.

Make the finished result a distinct focus area: one white panel with a restrained navy top edge, a clear **Your workshop pack** heading, the labeled **Workshop goal**, checks, and a shared tab strip for Agenda, Exercise, Facilitator notes and Sources. Keep the active content inside that same panel with consistent spacing on desktop and mobile. This supersedes the earlier plain, unframed completed-content treatment.

Review happens in this interface; editing happens after download in the user's own document. The final export footer follows the content in DOM order as well as visually. Keep human review explicit: automated timing and reference checks do not certify that the workshop is ready to deliver without inspection.

## Visible agent work

Use `app/components/AgentWork.tsx` for the active work area and its completed history. Derive the five milestones only from the current run's recorded state:

| Workshop-preparation step | Evidence that the milestone is met |
| --- | --- |
| Confirm brief | The brief has a delivery format. This does not claim that the model has understood or approved the brief. |
| Review references | At least one reference is recorded as read. Show the actual read count; do not claim that all relevant references have been read. |
| Build workshop pack | A draft pack has returned and is recorded. |
| Check and improve | The current draft has passed the returned timing and reference validation. This does not imply a revision occurred or that workshop quality is approved. |
| Save for review | The run has the saved `completed` status. Human review remains required. |

Highlight the next unmet milestone as the workflow target, not as evidence of the model's current intent. Show the actual current tool separately from persisted `currentAction`, using its exact action label; the `draft_pack` tool is **Recording the returned draft**. During model requests, use factual pending-result, source-count and validation wording supported by the current run, such as a first draft pending, a returned draft awaiting checks, recorded issues awaiting a revised draft, or passed checks awaiting a saved pack. Do not infer that the model is currently drafting, correcting or checking. Show one loading circle with the active status only while a preparation request or agent work is in progress; hide it while awaiting an answer, ready but idle, failed, completed, or viewing completed history. Do not repeat a spinner or phase line at the bottom. Show the recorded start time when supplied; when no current action is recorded during active preparation, say that the interface is waiting for the next update.

Keep recent recorded steps in a compact chronological list with recorded outcome timestamps, separate from the workflow target and current tool action. Put earlier recorded steps and Sources read in expandable disclosures. Show named, clickable sources for a current read when its source ID is known, and populate the source list and read count from the run's recorded read-source IDs. Those controls open the same read-only supplied-material dialog as pack citations. Detailed inputs and outputs remain under the optional Tool inputs and results disclosure while preparation is active.

Once a whole draft has returned, expose its agenda, exercise, facilitator notes and sources under Draft so far, with its revision and provisional status visible. During an active preparation before that, show No draft returned yet; this is not an initial-form output panel. Keep exact agenda minutes versus requested minutes and returned timing/reference check issues visible; separate draft availability, validation feedback and saved-for-review outcomes. A newly submitted preparation initially shows its own empty work state, without presenting the previous run's outcomes as new activity.

Show the clarification within Agent’s work and label the pack Your answer needed when input is required. Otherwise state whether no input is needed, the run is ready to resume, or preparation has stopped. Use only returned state and results: no inferred steps, completion percentages, simulated progress, or token-by-token streaming. On completion, workshop content takes priority and the completed work moves into the single collapsed **Run record** after the content and Markdown download. Expanding it shows every recorded tool event in chronological order, with readable outcomes and details, including recorded validation issues and draft revisions so the user can inspect the steps and corrections. Keep raw tool activity and the JSON download in that same record.

## Supplied materials and accessible interaction

State the material contract near the brief's single supplied-material disclosure: this prototype uses **3 fixed fictional demo references** about AI use cases, safe experimentation and facilitation. Users cannot upload or change materials. Do not imply a personal document library, editable source selection, or upload capability.

Make actual agenda and exercise references, cited facilitator-note references, and entries in Sources open the matching supplied material by its stable ID. Unknown references remain neutral text. The reader shows the exact supplied title, ID and content; it is read-only and keeps the existing source colors. Use the labeled native dialog in `app/components/MaterialReader.tsx`, styled by `app/material-reader.css`, with a scrollable content region that fits mobile screens. Focus the invoking source control before opening, move focus into the dialog, keep keyboard focus inside while open, and restore focus to that control after Escape or Close. Keep the close target 44px; use the 220ms entrance only when reduced motion is not requested.

Announce loading, preparation updates, clarification needs, resumable saved progress and completion through the polite, atomic live status region. Base updates on actual run state and recorded actions; distinguish the next unmet workflow target, actual current action and completed outcomes in announcements as well as visually. Move focus to the clarification question when input is needed and to the workshop/result heading when a run starts, resumes, is ready or completes. New preparation focuses the brief heading with `preventScroll` and scrolls the page to the top, keeping Back to workshop visible on mobile; do not scroll the brief heading to the viewport top and hide that navigation. Back to workshop restores focus to the workshop heading. If an active source control disappears while its reader is open, closing the reader returns focus to the workshop/result heading. Honor reduced motion for those scroll handoffs. Keep errors in alert regions and preserve the pack tabs' arrow-key, Home and End navigation.

## Boundaries

No sidebar, fabricated progress or completion indicators. Display recorded tool activity and actual state. Preserve synthetic-content, live/test and human-review labels; imply no affiliation, customers or business results.
