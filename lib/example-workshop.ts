import type { ContentReview, Material, PublicRun, Validation, WorkshopPack } from './types';

export const EXAMPLE_WORKSHOP_ID = 'ai-adoption';
export const EXAMPLE_WORKSHOP_PATH = '/example';

/**
 * Bundled read-only example; importing this file makes no storage or model calls.
 * Source: .local/ai-workshop-quality-batch/results/01/run.json
 * Fictional inputs: .local/ai-workshop-quality-batch/scenarios/01.json
 * Separate blind content audit: .local/ai-workshop-quality-batch/audits/01.json
 * Brief, sources, pack, validation, content review and historical provenance are unchanged.
 * Original tool-event records are excluded; PublicRun requires an empty events array.
 * No messages, ownership data, current action or request/response records are bundled.
 */
export const exampleWorkshopMetadata = {
  "title": "Northlight Supply AI Pilot Selection Workshop",
  "summary": "A 75-minute workshop for nine nontechnical leaders to compare three fictional AI options and choose one bounded pilot.",
  "provenance": "Saved from a real model-generated preparation on 5 September 2026 using fictional materials. Exploring this example does not run the model.",
  "reviewDisclosure": "The saved pack passed automated checks and model-assisted content review. A separate assistant audit found no material content issue. It remains a draft for human review; no participant trial or measured business result is claimed.",
  "sourceRunId": "d3c5593f-ca1d-452e-80e1-063def8fc322",
  "generatedAt": "2026-09-05T22:34:27.874Z",
  "model": "gemini-3.8-flash",
  "fictional": true
} as const;

export const exampleWorkshopRun: PublicRun & {
  pack: WorkshopPack;
  materials: Material[];
  contentReview: ContentReview;
  validation: Validation;
} = {
  "id": "d3c5593f-ca1d-452e-80e1-063def8fc322",
  "createdAt": "2026-09-05T22:33:37.960Z",
  "updatedAt": "2026-09-05T22:34:27.874Z",
  "status": "completed",
  "mode": "live",
  "model": "gemini-3.8-flash",
  "workflowVersion": 2,
  "brief": {
    "format": "in-person",
    "audience": "Nine nontechnical business leaders at fictional Northlight Supply: operations, commercial and service managers. All can compare simple whole-number scores; none needs coding experience.",
    "objective": "In 75 minutes, choose exactly one eligible AI pilot using the supplied gate, scoring rule and tie-breaker. Produce one decision card naming the chosen option, gate result, score, reason, supplied owner role, two-week pilot scope, success measure and stop rule, plus a reason for each rejected or deferred option.",
    "constraints": "Use only the two fictional sources. All companies, policies and figures are invented exercise inputs, not customer evidence. No live accounts, personal data, provider calls, automatic customer actions or implementation. Participants work in three tables of three using paper or a plain text worksheet included in the pack. Apply eligibility before scoring. Use the supplied owner roles and measure; do not invent savings, calendar dates or completed commitments. Keep the main exercise to a decision card and three option dispositions.",
    "durationMinutes": 75
  },
  "materials": [
    {
      "id": "s01-pilot-rules",
      "kind": "text",
      "title": "Northlight fictional pilot decision rules",
      "content": "FICTIONAL EXERCISE: Northlight Supply, this policy and all figures are invented. The workshop selects a proposal; it does not launch a pilot or certify business results. Eligibility gate: only supplied public product text or synthetic requests may enter the pilot; output must be a draft reviewed by a person; the pilot may not change customer records, send messages or issue refunds. Reject an option that fails any gate before comparing scores. For eligible options, score = stated business value + stated readiness, each from 1 to 5. A tied score is resolved by the lower effort number. Do not invent new scores. The selected pilot lasts two weeks after an actual start is agreed; no calendar start or follow-up date is supplied. For option A, the Service Lead is the supplied owner role; for C, the Commercial Lead is the supplied owner role. The final decision card records option, gate, calculation, tie-break reason if needed, owner role, bounded scope, proposed success measure and stop rule. Every table must also record a reason for the disposition of A, B and C. Suggested measures are pilot targets, never verified outcomes.",
      "filename": "01-fictional-pilot-rules.txt"
    },
    {
      "id": "s01-option-cards",
      "kind": "text",
      "title": "Northlight fictional option cards and trial input",
      "content": "FICTIONAL OPTIONS AND FIGURES. A: public product FAQ drafting. Value 4, readiness 4, effort 1. Use supplied public product facts and 12 synthetic questions; a Service Lead reviews every answer before use. Proposed success target: at least 10 of 12 answers contain only supported facts, with zero unsupported warranty promises. Stop the pilot if any draft exposes personal data or would be sent without review. B: autonomous refund agent. Value 5, readiness 5, effort 1. It reads identifiable customer complaint records and immediately issues refunds without human approval. C: synthetic sales-enquiry summary drafts. Value 5, readiness 3, effort 3. Use synthetic enquiry messages; the Commercial Lead reviews summaries and no customer system changes occur. C is eligible, but A wins the score tie on effort. One supplied A trial input: public facts say the fictional Luma desk lamp costs 390 SEK, has two brightness levels and a one-year warranty. Synthetic question: Does Luma have three brightness levels and a five-year warranty? A supported draft says it has two brightness levels and a one-year warranty. The invented price, product details, scores and targets are exercise inputs, not market facts or results.",
      "filename": "01-fictional-option-cards.txt"
    }
  ],
  "pack": {
    "title": "Northlight Supply AI Pilot Selection Workshop",
    "agenda": [
      {
        "title": "Introduction & Evaluation Framework Setup",
        "minutes": 10,
        "activity": "Welcome the 9 operations, commercial, and service managers organized into three tables of three. Review workshop boundaries: fictional exercise inputs only, no live customer systems or provider calls, and strict sequence of applying the eligibility gate before any scoring or tie-breaking [s01-pilot-rules]. Introduce the three fictional pilot options A, B, and C [s01-option-cards].",
        "sourceIds": [
          "s01-pilot-rules",
          "s01-option-cards"
        ]
      },
      {
        "title": "Option Review & Eligibility Gating",
        "minutes": 15,
        "activity": "In three tables of three, participants evaluate options A, B, and C against the mandatory eligibility gate: only supplied public product text or synthetic requests allowed, outputs must be human-reviewed drafts, and no changing customer records, sending messages, or issuing refunds [s01-pilot-rules]. Tables record gate pass/fail status and specific failure reasons, filtering out ineligible options before calculating scores [s01-option-cards].",
        "sourceIds": [
          "s01-pilot-rules",
          "s01-option-cards"
        ]
      },
      {
        "title": "Pilot Scoring & Decision Card Exercise",
        "minutes": 30,
        "activity": "Working in small groups, participants complete the decision exercise. For eligible options, calculate total score (stated business value + stated readiness), apply the tie-breaker rule (lower effort number wins ties), select the winning pilot, and populate the final decision card and option dispositions worksheet [s01-pilot-rules]. Ground the decisions in the option cards [s01-option-cards].",
        "sourceIds": [
          "s01-pilot-rules",
          "s01-option-cards"
        ]
      },
      {
        "title": "Table Readouts & Cross-Group Synthesis",
        "minutes": 12,
        "activity": "Each table presents its completed decision card and disposition rationale. Compare results across tables to confirm consensus on Option A selection, tie-breaker logic (Option A effort 1 vs Option C effort 3), Option B gate rejection rationale, and Option C deferral rationale [s01-pilot-rules]. Review against the option criteria [s01-option-cards].",
        "sourceIds": [
          "s01-pilot-rules",
          "s01-option-cards"
        ]
      },
      {
        "title": "Decision Card Alignment & Governance Wrap-up",
        "minutes": 8,
        "activity": "Consolidate the final agreed decision card. Review the pilot boundaries: Option A two-week pilot scope, Service Lead ownership, success measure, and explicit stop rule [s01-pilot-rules]. Confirm that the two-week pilot duration begins only after an actual start is agreed, leaving start and follow-up dates undated [s01-option-cards].",
        "sourceIds": [
          "s01-pilot-rules",
          "s01-option-cards"
        ]
      }
    ],
    "outcome": "Participants will evaluate three fictional AI pilot options against Northlight Supply's eligibility criteria, score eligible options, apply tie-breaking rules, and produce an agreed decision card selecting Option A (Public Product FAQ Drafting) owned by the Service Lead, along with clear disposition rationales for all three options.",
    "sources": [
      {
        "id": "s01-pilot-rules",
        "title": "Northlight fictional pilot decision rules"
      },
      {
        "id": "s01-option-cards",
        "title": "Northlight fictional option cards and trial input"
      }
    ],
    "exercise": {
      "title": "Decision Card Formulation & Pilot Selection",
      "debrief": [
        "Review Table Consensus on Eligibility: Confirm why Option B is disqualified before scoring (reads identifiable customer complaint records and immediately issues refunds without human approval, violating data and customer impact gates) [s01-pilot-rules]. Verify details from the option card [s01-option-cards].",
        "Review Scoring and Tie-Breaker: Confirm that both Option A (Value 4 + Readiness 4 = 8) and Option C (Value 5 + Readiness 3 = 8) tie on score, but Option A is selected because lower effort number breaks the tie (Option A effort 1 vs Option C effort 3) [s01-pilot-rules]. Check stated figures [s01-option-cards].",
        "Verify Governance and Boundaries: Ensure every table identified the supplied Service Lead role for Option A, recorded the exact success measure and stop rule, and preserved the rule that no calendar start date is assumed [s01-pilot-rules]. Verify against option specifications [s01-option-cards]."
      ],
      "scenario": "Fictional case details for Northlight Supply (all figures, options, and rules are invented exercise inputs):\n\nEvaluation Gate Rules:\n1. Input Restriction: Only supplied public product text or synthetic requests may enter the pilot.\n2. Review Requirement: Output must be a draft reviewed by a person.\n3. System Boundaries: The pilot may not change customer records, send messages, or issue refunds.\nRule: Reject an option that fails any gate before comparing scores.\n\nScoring and Tie-Breaker Rules:\n- Score = Stated Business Value + Stated Readiness (each 1 to 5).\n- Tied score resolution: Lower effort number wins. Do not invent new scores.\n- Duration & Governance: The selected pilot lasts two weeks after an actual start is agreed; no calendar start or follow-up date is supplied.\n\nOption Profiles:\n- Option A: Public product FAQ drafting. Value 4, Readiness 4, Effort 1. Scope: Use supplied public product facts and 12 synthetic questions; a Service Lead reviews every answer before use. Proposed success target: At least 10 of 12 answers contain only supported facts, with zero unsupported warranty promises. Stop rule: Stop the pilot if any draft exposes personal data or would be sent without review. Trial input reference: Public facts state fictional Luma desk lamp costs 390 SEK, has two brightness levels, and a one-year warranty. Synthetic query asks if Luma has three brightness levels and a five-year warranty; supported draft clarifies it has two brightness levels and a one-year warranty. Supplied owner role: Service Lead.\n- Option B: Autonomous refund agent. Value 5, Readiness 5, Effort 1. Mechanism: Reads identifiable customer complaint records and immediately issues refunds without human approval.\n- Option C: Synthetic sales-enquiry summary drafts. Value 5, Readiness 3, Effort 3. Scope: Uses synthetic enquiry messages; the Commercial Lead reviews summaries and no customer system changes occur. Supplied owner role: Commercial Lead.",
      "sourceIds": [
        "s01-pilot-rules",
        "s01-option-cards"
      ],
      "instructions": [
        "Review the fictional option details in the scenario. Do not invent any new numbers, external tools, customer accounts, or calendar dates [s01-pilot-rules]. Consult the option data [s01-option-cards].",
        "Apply the eligibility gate to options A, B, and C using Gate Criteria: 1) Uses only supplied public product text or synthetic requests; 2) Output must be a draft reviewed by a person; 3) Does not change customer records, send messages, or issue refunds [s01-pilot-rules]. Disqualify any option that fails any gate before scoring.",
        "For all eligible options, calculate Score = Business Value + Readiness (values 1 to 5). If scores are tied, resolve using the lower effort number [s01-pilot-rules]. Select exactly one winning pilot.",
        "Fill in the blank Decision Card and Option Dispositions templates below on paper or plain text:\n\n--- DECISION CARD TEMPLATE ---\nSelected Option: [Fill Option ID and Name]\nGate Result: [Pass / Fail]\nScore Calculation: [Business Value + Readiness = Total Score]\nTie-Break Reason: [State effort comparison if tied]\nSupplied Owner Role: [Accountable Lead Role]\nTwo-Week Pilot Scope: [Bounded input facts, synthetic question volume, review requirement]\nProposed Success Measure: [Target accuracy / factual constraint]\nStop Rule: [Specific safety / process breach triggering immediate stop]\n\n--- OPTION DISPOSITIONS TEMPLATE ---\nOption A Disposition: [Selected / Deferred / Rejected]\nOption A Reason: [Explanation covering gate, score, and tie-break]\nOption B Disposition: [Selected / Deferred / Rejected]\nOption B Reason: [Explanation covering gate criteria]\nOption C Disposition: [Selected / Deferred / Rejected]\nOption C Reason: [Explanation covering gate, score, and tie-break]"
      ],
      "expectedOutput": "One completed decision card for the selected pilot (Option A) including gate result, score calculation, tie-breaker reason, supplied owner role, two-week pilot scope, proposed success measure, and stop rule, accompanied by explicit disposition records and reasons for all three evaluated options (A, B, and C).",
      "sampleResponse": "[ILLUSTRATIVE WORKED ANSWER KEY]\n\n--- DECISION CARD ---\nSelected Option: Option A (Public product FAQ drafting)\nGate Result: Pass (uses public product facts and synthetic questions; outputs are human-reviewed drafts; no customer record changes, messaging, or refunds)\nScore Calculation: Value 4 + Readiness 4 = Total Score 8\nTie-Break Reason: Tied with Option C on total score (8 vs 8); Option A wins because its effort rating is 1, which is lower than Option C's effort rating of 3\nSupplied Owner Role: Service Lead\nTwo-Week Pilot Scope: Run for two weeks after start is agreed; use supplied public product facts and 12 synthetic questions; Service Lead reviews every answer draft before use\nProposed Success Measure: At least 10 of 12 answers contain only supported facts, with zero unsupported warranty promises\nStop Rule: Stop the pilot immediately if any draft exposes personal data or would be sent without review\n\n--- OPTION DISPOSITIONS ---\nOption A Disposition: Selected\nOption A Reason: Passes all eligibility gates; ties Option C with total score 8 (Value 4 + Readiness 4); wins tie-breaker with lower effort number (1 vs 3).\nOption B Disposition: Rejected\nOption B Reason: Fails eligibility gate before scoring. It reads identifiable customer complaint records and autonomously issues refunds without human review, violating data input, human-in-the-loop draft review, and customer transaction restrictions.\nOption C Disposition: Deferred\nOption C Reason: Passes eligibility gate (uses synthetic enquiry messages, Commercial Lead reviews summaries, no customer system changes) and achieves total score 8 (Value 5 + Readiness 3), but is deferred because Option A has lower effort (1 vs 3).",
      "durationMinutes": 30,
      "agendaSectionIndex": 2
    },
    "sourceClaims": [
      {
        "claim": "An option that fails any part of the eligibility gate must be rejected before comparing scores, and eligible options are scored by summing business value and readiness.",
        "quote": "Reject an option that fails any gate before comparing scores. For eligible options, score = stated business value + stated readiness, each from 1 to 5.",
        "sourceId": "s01-pilot-rules"
      },
      {
        "claim": "Option A and Option C tie on total score, but Option A wins the tie-breaker due to lower effort.",
        "quote": "C is eligible, but A wins the score tie on effort.",
        "sourceId": "s01-option-cards"
      }
    ],
    "facilitatorNotes": [
      "Room Setup & Materials: Arrange room for 9 nontechnical participants into three tables of three. Supply paper or plain-text worksheets. Emphasize that all scenarios, figures, and rules are fictional exercise inputs and no live customer accounts, provider APIs, or external data may be used [s01-pilot-rules].",
      "Enforcing Gating Before Scoring: Remind facilitators to ensure tables apply the three eligibility gates to Option B prior to any calculation. Option B must be disqualified immediately for processing identifiable customer complaints and issuing refunds autonomously without human review [s01-pilot-rules] [s01-option-cards].",
      "Guiding Tie-Breaker & Owner Assignment: Ensure participants calculate Option A (4 + 4 = 8) and Option C (5 + 3 = 8), then apply the tie-breaker where the lower effort number wins (Option A effort 1 beats Option C effort 3). Confirm participants assign the source-mandated Service Lead role to Option A rather than inventing new roles [s01-pilot-rules] [s01-option-cards].",
      "Managing Dates & Boundaries: Clarify that the workshop selects a proposal and does not launch a live pilot. The two-week pilot scope begins only after an actual start date is agreed; facilitators must not invent calendar start or follow-up dates during the exercise or readouts [s01-pilot-rules]."
    ]
  },
  "validation": {
    "valid": true,
    "issues": [],
    "totalMinutes": 75
  },
  "contentReview": {
    "mode": "model",
    "checks": {
      "goal": {
        "passed": true,
        "reason": "The pack fully meets the brief: exercise instructions and sampleResponse produce a complete decision card for Option A (gate result, score calculation 4+4=8, tie-break rationale, single accountable Service Lead owner, 2-week pilot scope, success measure, stop rule) and provide explicit disposition reasons for options A, B, and C as required by s01-pilot-rules and s01-option-cards."
      },
      "audience": {
        "passed": true,
        "reason": "The design fits nontechnical commercial, operations, and service leaders: tasks rely on basic whole-number scoring (1-5) and straightforward qualitative gates without coding, technical terminology, or external policy prerequisites."
      },
      "grounding": {
        "passed": true,
        "reason": "All statements, scores, gate rules, and roles are grounded in s01-pilot-rules and s01-option-cards. Option B is disqualified before scoring due to unreviewed refunds, and Option A breaks the score tie with Option C based on lower effort (1 vs 3) under Service Lead ownership."
      },
      "constraints": {
        "passed": true,
        "reason": "All brief constraints are honored: total duration is 75 minutes across 5 segments; participants work in 3 tables of 3; eligibility precedes scoring; no live customer systems, provider calls, savings estimates, or calendar dates are introduced."
      },
      "completeness": {
        "passed": true,
        "reason": "The exercise is self-contained with complete scenario data, explicit instructions, worksheet templates, debrief prompts, and an answer key. It is accurately mapped to agendaSectionIndex 2 with a 30-minute allocation matching the segment duration."
      }
    },
    "issues": [],
    "status": "passed",
    "attempt": 1,
    "reviewedPackHash": "dd8e1498acab8ce3e63988da5c0bad97fe022da6b6b04f45b56c27f8a17ee0db",
    "reviewedRevision": 2
  },
  "steps": 7,
  "revision": 2,
  "readSourceIds": [
    "s01-pilot-rules",
    "s01-option-cards"
  ],
  "version": 30,
  "events": []
};
