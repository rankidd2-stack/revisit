# Decision log

Newest first. Locked decisions live in CLAUDE.md; this log records every decision and who made it.

| Date | Decision | By | Reversible? |
| --- | --- | --- | --- |
| 2026-10-30 | Compliance pass 1 fixes: single send pipeline (texts cannot skip checks), email mutes, append-only consent ledger, sender-name approval, service text mapped to clinic categories, dental testimonials blocked in schema, wider DTI and claim wording checks | Claude (from compliance-guard) | Yes |
| 2026-10-30 | Vets may name pet care (vaccine, deworming) in texts; human clinics may not name treatments by default. Overrides compliance-guard's suggestion to block vet terms: pet records are not human health data | Claude | Yes |
| 2026-10-30 | Working name "Revisit" for the codebase (placeholder); brand name is Patrick's call | Claude | Yes |
| 2026-10-30 | Stack: TypeScript, Vitest, Postgres (Supabase-compatible) schema; Next.js console next | Claude | Yes |
| 2026-10-30 | Agent roster: builder (main session) + pm, reviewer, compliance-guard | Claude, approved by Patrick | Yes |
| 2026-10-30 | Product is AI-native: AI drafts and proposes, a human approves (goal-based campaigns, daily autopilot queue, photo-to-patient-list import) | Patrick | Yes |
| 2026-10-29 | Discount promos, loyalty and referral rewards moved to the Add-on backlog | Patrick | Yes |
| 2026-10-28 | Testimonials via Google Form, plain consent, clinic posts manually | Patrick | Yes |
| 2026-10-28 | Marketing texts to opted-in contacts only; VIP-list framing for opt-in | Patrick | No (legal) |
| 2026-10-28 | Registered sender name SMS, reply path and stop link in every text; no own SIMs | Patrick | No (carrier rules) |
| 2026-10-28 | Launch verticals: dental and vet; aesthetics later | Patrick | Yes |
| 2026-10-28 | No patient chatbot; replies go to the clinic | Patrick | Yes |
