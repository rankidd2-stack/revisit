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

## 2026-10-30 -- Reviewer pass 2
- FIXED (blocker): send kind is now derived from the event (campaign = marketing, always). The caller can no longer label a promo as a reminder to skip consent, caps and the discount check. DB constraint `kind_matches_event` enforces the same.
- FIXED: approvals bind to their event (`recall-rule:<id>`, `reminders`, `feedback`, or the exact campaign). Blank `approved_by` refused in DB.
- FIXED: only a person pressing send (`sendingNow`) may send while sync is stale; scheduled campaigns pause like automations.
- FIXED: footer links get the shortener check; pets/dependents with recall history can be deleted; consent rows are tenant-bound and TRUNCATE is blocked.
- FIXED: CSV stray quotes, DD/MM detection, species mapping, families sharing one number (later names become dependents), one email per contact.
- NOT CHANGED, by design: "linis" and "oral prophylaxis" (cleaning) are not blocked. Cleaning is the benign default visit; blocking it would block nearly every dental recall.
- DEFERRED to Phase 3: merging two pets due the same day into one text (the daily cap already stops a second text; the other pet goes the next day), Semaphore 120 calls/min throttle (pilot volume is far below it), per-recipient error detail.
- Campaigns table is marketing-only. A non-marketing one-off notice (e.g., clinic closed) is a future "service notice" type; needs Patrick's call on consent posture.

## 2026-10-30 -- Phase 1 sign-off (reviewer pass 3: pass; compliance-guard pass 2: pass)
- Send gate, recall engine, CSV import and Semaphore client milestones closed.
- Hardening after sign-off, all tested:
  - Approvals carry the approved template; the pipeline renders the text itself, so patients get the approved wording.
  - Editing a campaign body or recall template withdraws approval in the DB; active recall rules require approval.
  - Sending during stale sync needs `staleAcknowledgedBy` (a named person), stored on `sends.stale_ack_by`.
  - Texts about a dependent never name a treatment, regardless of the clinic opt-in (DPA s.13).
  - Aesthetic clinics never group households.
  - Event keys are bound to campaign/recall columns.
  - Opt-outs can't be unlinked from a living contact; sender name edits reset to pending.
  - Promo, claim, treatment and shortener lists extended.
- OPEN for Patrick: allowing cleaning/linis/check-up wording in default texts (recommended yes); legal check on dependent texts, folded into the dental testimonial consult.
- OPEN, Phase 4: clinic offboarding. `consent_events` blocks deleting a clinic, by design. Offboarding needs an export-then-anonymize path; deleting data is Patrick's call.
- OPEN, console: the clinic reviews grouped households and picks the holder at import.

## 2026-10-30 -- Placeholder name "Revisit"
- Patrick: brand must be global, no Filipino words. Placeholder "Revisit" until he picks the brand.
- Stop-link domain in tests is now revisit.example (placeholder until a real domain is bought).
- Kept on purpose: the Tagalog/Taglish wording checks (bunot, pasta, hindi masakit, etc.). They are compliance filters for PH texts, not branding.
- Next (Claude decides, code structure): move PH specifics (+63 numbers, Asia/Manila, Semaphore, DTI/DPA word lists) into a "Philippines market pack" during database wiring, so the core is country-neutral.
