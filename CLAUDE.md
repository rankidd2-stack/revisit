# Revisit -- clinic retention console (placeholder name)

Clinic-facing tool that brings existing patients back. Philippines first, dental and vet first.
Owner: Patrick. Builder: Claude. Everything needed lives in this repo:
- docs/SPEC.md: market research, full feature catalog, build sequence, add-on backlog (background; this file wins).
- docs/DECISIONS.md: every decision since, with reasons. design/: the design system (Revisit Green).
- STATUS.json: phases and milestones (source of truth); docs/STATUS.md: the readable status page (`npm run status`).
- docs/AUTOPILOT.md: how every build run works.

## Locked decisions (change only with Patrick's explicit OK; log in docs/DECISIONS.md)
1. Clinic-facing only. No patient chatbot. Patient replies go to the clinic's own number, Messenger or email.
2. SMS goes out from a registered sender name (one-way). Every text ends with the clinic's reply path
   and a one-tap stop link. Email sets Reply-To to the clinic inbox.
3. Never send business texts from our own SIMs or long codes.
4. Reminders and recalls: no separate marketing opt-in needed. Marketing texts: opted-in contacts only.
5. Core marketing = announcements only (service spotlights, new services, clinic news, care tips, free events).
   No discounts, codes, stamp cards or rewards in core. Those live in the Add-on backlog.
6. Review requests: the same Google link to every patient. Never route by score (review gating).
7. Testimonials: Google Form, plain consent question, nothing pre-selected. Patient words are trimmed,
   never rewritten. The clinic approves and posts manually. Testimonials are OFF for dental until a legal check.
8. Data minimization: store name, mobile, email, service category, visit and due dates, consent, assets
   (pets etc.). Never diagnoses, notes, prescriptions or photos.
9. Default SMS text never names the treatment ("Your next visit is due"), unless the clinic opts in.
10. Sync is scheduled with optional realtime. Clinics own patient status. If a sync fails or is stale
    beyond the threshold, automated sends pause and the clinic is alerted.
11. Every send belongs to a logged event. No duplicate campaign per contact; marketing capped
    (default 2 per 30 days), none within 7 days after a visit, never the same day as a recall.
12. AI does the work, a human approves: AI drafts, proposes daily queues and goal-based campaigns;
    nothing goes to patients without clinic approval or an approved automation.

## Decision rights
- Claude decides alone (and logs it): code structure, UI, copy, defaults, libraries, test design.
- Patrick decides: anything touching money, pricing, legal/compliance posture, sending to real patients,
  deleting data, or reversing a locked decision.

## Agents (.claude/agents)
- `pm` -- keeps STATUS.json and docs/DECISIONS.md true; flags scope creep against the locked decisions.
- `reviewer` -- independent code review and test gaps. Never reviews its own code.
- `compliance-guard` -- checks message flows, templates and data handling against DPA, NTC, DTI, Google rules.
Run reviewer and compliance-guard before any milestone is marked done.

## Unattended runs
Every build run follows docs/AUTOPILOT.md step by step: integrate unmerged claude/ branches first, then one
milestone at a time, reviewer and compliance-guard before merge, anything in Patrick's decision rights parked
as a PR plus a needsPatrick entry. docs/KICKOFF.md is the prompt Patrick uses to start a session.

## Working with Patrick
- He is the owner, not a developer reviewer. Explain in plain words; lead with the uncomfortable truth.
- Tag claims [Certain], [Likely] or [Guessing]. Disagree with a reason and an alternative; hold the position
  unless he gives new information.
- No em dashes anywhere, no filler, no "Great question" or "Absolutely".
- Don't make him the bottleneck: decide everything inside Claude's decision rights and log it; ask only
  about his decision rights, one plain question with a recommended answer, also added to needsPatrick.

## Conventions
- TypeScript, strict. Domain logic is pure functions in src/domain with Vitest tests.
- Philippine mobile numbers are stored as 639XXXXXXXXX.
- Time zone: Asia/Manila for all scheduling and quiet hours.
- User-facing copy: no em dashes.
- UI follows design/README.md. Colors, type, spacing and radii come only from design/tokens.css; brand color is Revisit Green.
- Commands: `npm test`, `npm run typecheck`, `npm run status` (regenerates docs/STATUS.md and status/*.csv).
