# Your workshops drawer — design QA

Date: 2026-09-05

Scope: Implement selected option 1 in the existing Workshop Prep Agent. Replace the native history select with a right-side drawer. Preserve saved workshop data and the existing result content.

## Evidence

- Source visual truth: `/Users/faroukhajjej/.codex/generated_images/01a06965-f58c-7301-9432-f30dacc582e6/exec-4a963ab1-a3e6-4a4f-a721-37850a15ed0d.png`.
- First implementation: `/tmp/workshop-recent-ideation/drawer-desktop.png`.
- Final desktop implementation: `/tmp/workshop-recent-ideation/drawer-desktop-final.png`.
- Mobile implementation: `/tmp/workshop-recent-ideation/drawer-mobile.png`.
- URL: `http://127.0.0.1:3210/?run=d702d41c-255f-49c0-9e35-22f829df35cd`.
- Source and desktop capture: 1487 × 1058 pixels; CSS viewport 1487 × 1058. No density normalization was necessary.
- Mobile: 390 × 844 pixels and CSS viewport.
- State: drawer open, current revised workshop selected. The app contains two actual recent entries; the concept contains three illustrative entries. Real titles and timestamps were retained.
- Full-view comparisons: the source image and each desktop implementation screenshot were emitted together in the same comparison input. The 490px drawer was readable at full-view scale, so a separate focused crop was unnecessary.

## Findings and comparison history

1. Initial comparison: [P2] The desktop overlay covered part of the result and header actions, while the selected concept placed the result beside the drawer. Fixed by reserving 490px for the drawer on desktop viewports of at least 1100px. The final desktop comparison shows both regions without clipping.
2. Interaction verification: Shift+Tab at the first control could leave document focus, so explicit first/last button cycling was added. Retesting confirmed focus stays within the dialog.
3. Code review: dismissal during a pending open could try to focus a disabled trigger. Added a content-heading fallback. Verified Escape during a delayed request places focus on the workshop heading. A missing clarification heading now falls back to the result heading.
4. Final comparison: no actionable P0/P1/P2 findings in the scoped drawer.

## Required fidelity surfaces

- Fonts and typography: existing DM Sans UI typography retained; readable 17px wrapping titles, 22px panel heading, and separate date and status text. Full stored titles intentionally take more lines than the abbreviated concept labels.
- Spacing and layout rhythm: full-height 490px right panel, 26px desktop insets, divider-separated rows, selected-row accent, and footer at the bottom. Mobile fills the viewport and independently scrolls. Close target measures 44px.
- Colors and visual tokens: existing white, navy, pale slate, border, amber, and purple tokens retained. Current and revised markers are both textual; status is not conveyed by color alone.
- Image quality and assets: no new raster assets required. Existing Lucide List, X, Check, ChevronRight and LoaderCircle icons match the reference's simple line icons. Existing brand and workshop visualizations were retained.
- Copy and content: real saved titles, update timestamps and states used. Current/Revised labels follow stored values. Failed work is labelled Preparation stopped, rather than In progress. The original workshop content, timing and review sections remain intact; illustrative changes to those regions in the concept were outside this task.

## Verification

- Open/close, Escape, Shift+Tab containment and trigger focus restoration: passed.
- Switch between both existing saved workshops: passed; drawer closes, URL updates, and result heading receives focus.
- Choose current workshop: passed; URL unchanged and no replacement operation.
- Controlled 503 on the selected read request: drawer retains the current row, displays an inline error, and allows retry. Retry opened the saved workshop successfully. Temporary request interception was cleared afterward.
- Delayed request: row shows Opening and other selections are disabled. Dismissal remains available with a valid focus fallback.
- Mobile 390 × 844: panel width 390, height 844, scroll region client width and scroll width both 390; no horizontal overflow. Long titles and status markers remain readable.
- Reduced motion: drawer animation computed as none. Temporary media/viewport overrides were reset.
- Browser console check returned no errors or warnings.
- `npx tsx --test tests/workshop-history.test.ts tests/recent-runs.test.ts tests/workflow-ui.test.ts`: 12 passed.
- `npm run typecheck`: passed.
- `git diff --check`: passed.

## Open questions and limits

- None blocking. Recent history remains scoped to this browser and the existing ten-entry limit.
- The full-height mobile layout is a responsive adaptation; the selected source is desktop-only.
- No new generation, database writes, commit, push or deployment was performed.

## Implementation checklist

- [x] Replace native select with drawer trigger and accessible dialog.
- [x] Render titles, dates, selection, revision and status labels.
- [x] Preserve workshop opening and failure behavior.
- [x] Verify desktop/mobile visuals and keyboard/loading/error interactions.
- [x] Reset temporary browser test settings and leave local preview available.

## Follow-up polish

None required for this scoped implementation.

final result: passed

---

# Workshop home and preparation navigation

Date: 2026-09-05

Scope: Give the local app a clear starting point: Your workshops → Workshop brief → Preparation → Workshop pack. Reuse the saved-workshop drawer inside a workshop. No changes to model generation, persistence adapters, deployment or export contents.

## Design review

- Existing visual direction: the previously generated workshop-library concept (`exec-658925ea-56e6-41f6-95b8-ab71be29952d.png` in the same generated-images directory listed above), plus the implemented drawer's typography and row component.
- Final desktop: `/tmp/workshop-recent-ideation/home-desktop-final.png`.
- Final mobile home: `/tmp/workshop-recent-ideation/home-mobile-final.png`.
- Final mobile brief: `/tmp/workshop-recent-ideation/brief-mobile-final.png`.
- Desktop concept and implementation were viewed together. This is a structural adaptation, not a pixel-identical clone: the home uses the existing drawer's sans-serif row titles, puts date/status beneath each full title, and keeps the new-workshop action prominent. The prototype retains its own brand, colors, borders and spacing tokens.
- Mobile CSS viewport: 390 × 844; document width: 390. All three stage labels fit inside the viewport; the last label ends at 372px. Titles wrap and rows remain individually selectable. Both the home and brief were visually inspected.
- Browser compositor captures initially returned mis-scaled images during viewport changes. Stable surface captures replaced those files; the final mobile images show the actual layout. An intermediate native-window capture was discarded.

## Interaction checks

- Root URL opens Your workshops, while a saved-run link opens that workshop. The prior browser history remains available.
- New workshop opens a blank brief with no preselected fictional references. Upload, paste and example-selection controls remain available.
- Home, Back, Forward, opening a saved pack and returning to a brief retain typed audience/outcome and unfinished pasted material during the mounted session.
- An empty brief does not display an unfinished-work warning on Home. A nonempty one exposes Continue brief, without a misleading second New workshop action.
- Source readers close on accepted browser history navigation.
- A delayed saved-workshop read cannot override Back to the currently loaded workshop. Superseded reads do not change the selected view.
- Existing workshop deep links and refresh were checked against actual saved read endpoints. No saved workshop contents were modified.
- Controlled API test on the separate localhost origin used snapshots from the actual local scripted agent loop. It covered failed creation with retained input, retry, required format clarification, in-app Back while an answer is pending, submission in progress, completed pack, enabled navigation, and the completed item on Home. API interception prevented real generation or database writes.
- The isolated test tab was closed, request interception was cleared, temporary brief text was removed, and viewport overrides were reset. The user's preview remains on Home.

## Corrections from focused review

1. Invalidate pending reads even when reopening the current workshop.
2. Close the source reader on browser Back/Forward.
3. Give an existing unfinished brief a truthful Continue brief action.
4. Keep the browser-history listener's unfinished-input state current, including format and duration changes.

## Verification and limits

- `npm run typecheck -- --incremental false`: passed on the final implementation.
- `npx tsx --test tests/recent-runs.test.ts tests/workshop-history.test.ts tests/workflow-ui.test.ts`: 12 passed.
- `git diff --check`: passed.
- Scripted lifecycle fixture: ready → awaiting input → completed, generated entirely in a temporary local store; the store was removed after producing test snapshots.
- This validates navigation and presentation, not new live model quality. No paid model call, provider change, commit, push, merge or deployment was performed.
- Recent history remains the existing browser-scoped ten-entry list. Unsubmitted briefs are retained in the current session, with a native leave-page warning for nonempty input; they are not a new persistent draft library.
- Development hot reload produced a React hook-dependency warning while the implementation was being edited. It is recorded separately from application behavior; the final preview was reloaded after editing.

final result: passed for the scoped local navigation change

---

# Workshop cards and saved-record management

Date: 2026-09-05

Scope: Replace the Home rows with workshop cards; add library renaming and confirmed deletion from the actual backing store. Build and verify locally only.

## Design and browser proof

- Kept the existing navy, serif headings, sans-serif content and quiet bordered surfaces. Desktop uses two columns; mobile uses one. Full names and audience text wrap. The primary card starts a new brief or continues an unfinished one.
- Visually inspected desktop and mobile cards: `/tmp/workshop-recent-ideation/cards-desktop.png` and `/tmp/workshop-recent-ideation/cards-mobile.png`.
- At a 390px CSS viewport, document width stayed at 390px. The confirmation dialog occupied approximately 356px, within the viewport, with Cancel initially focused. Its mobile content and button arrangement were inspected; inconsistent compositor captures of that dialog were discarded rather than retained as proof.
- Real saved records were read to populate metadata and preview the confirmation. The confirmation was cancelled; no real workshop was renamed or deleted.
- Isolated localhost browser tests intercepted API fetches and used synthetic snapshots. They verified successful rename; failure retaining the old card and typed name; an explicit reload/retry; typing before a delayed initial response; and cancellation without a mutation.
- Delete required an explicit confirmation. Cancel sent no DELETE. A simulated version conflict kept the card and required reload plus another confirmation. Success removed the card, and it stayed absent after browser refresh. A nonempty unfinished brief survived the deletion.
- A metadata failure showed Retry opening, which performed a fresh GET even when that workshop was already cached. A readable record without management permission showed no Rename/Delete controls.
- The isolated test tab was closed, interception was cleared, test text was removed and viewport overrides were reset. The normal user preview was left on Home.

## Corrections from focused review

1. A slow initial GET must not overwrite a name already being typed.
2. Retry opening must bypass the same-workshop cache shortcut after a read failure.
3. Late parent-record reads and run responses must not restore a workshop whose deletion was confirmed.

## Verification and boundaries

- `node_modules/.bin/tsx --test tests/workshop-management.test.ts tests/ui-live-test.test.ts tests/agent.test.ts`: 27 passed, including 9 new management tests.
- `npx tsx --test tests/recent-runs.test.ts tests/workshop-history.test.ts tests/workflow-ui.test.ts`: 13 passed.
- `npm run typecheck -- --incremental false`: passed.
- `git diff --check`: passed.
- Management tests use temporary local records and mocked Postgres, with network fetch forbidden. Coverage includes browser authority, strict same Origin, version validation/conflicts, immutable archives, local fallback, preserved pack/review/export contents, private hash exclusion, physical local deletion and save/delete races in both orderings.
- New runs and revisions store a private browser-management hash. Existing unowned records are manageable only under the local development loopback exception. This does not introduce private accounts or change the earlier public read/advance behavior.
- Rename changes a library label. Delete removes only the selected stored record; separate revisions and already downloaded files remain. Browser history is still bounded to ten entries, and losing the management cookie loses authority over owned records.
- No real database mutation, paid model call, provider change, commit, push, merge or deployment occurred during this implementation and verification.

final result: passed for the scoped local card and management change

---

## Single workshop-library navigation — 2026-09-05

Removed the sidebar entry point and duplicate page actions from the brief/pack header. The existing Home control is now **Back to workshops**, with its navigation locks and preservation handler retained. Failed-preparation copy points to that control and then the Home card for starting again.

Verified in the running browser: pack → Back to workshops → Home cards → New workshop → unfinished brief → Back to workshops → Continue brief retained the typed input. Test text was cleared, and a saved card reopened its pack with the single return control and no sidebar button. Type checking and `git diff --check` passed. No workshop generation, database mutation, commit, push or deployment was performed.
