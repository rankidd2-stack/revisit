# Decision log

Newest first. Locked decisions live in CLAUDE.md; this log records every decision and who made it.

| Date | Decision | By | Reversible? |
| --- | --- | --- | --- |
| 2026-10-30 | "Cleaning", "check-up" and "consultation" allowed in default patient texts, including when they are a clinic's own service category names (explicit English allowlist; a generic qualifier like "Dental" is fine, anything more still blocks). Default treatment list unchanged | Patrick | Yes |
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
| 2026-10-30 | Code lives in private GitHub repo rankidd2-stack/revisit (Patrick's account) | Patrick | Yes |

## 2026-10-30 -- Routine visit words allowed (Patrick)
- Patrick: "cleaning" and "check-up" are allowed in default patient texts. "Consultation" added to the same allowlist on Patrick's instruction.
- Built as an explicit allowlist in src/domain/sms.ts (`ALLOWED_VISIT_WORDS`, `isAllowedVisitTerm`). A clinic service category whose name is only one of these words, optionally after a generic qualifier (dental, teeth, tooth, general, routine, regular, annual), no longer blocks a default text. Plurals and "checkup" / "check up" spellings are covered.
- Still blocked: categories with anything more ("Cleaning and whitening", "Deep cleaning", "Ortho consultation", "Implant check-up"), and every word on the default treatment list, even in the same text as an allowed word.
- Applies to texts about dependents too. The open legal check on dependent texts (DPA s.13) still stands; if counsel says otherwise, dependent texts drop the allowlist.
- Not covered: "linis" (Filipino for cleaning). It is not on any default list, so it only blocks if a clinic names a category "Linis". The allowlist is English only, as instructed; adding Filipino visit words is a small follow-up if Patrick wants it.

## 2026-10-30 -- Database wiring 1: send-gate inputs from Postgres (Claude)
- Loaders in src/db/send-context.ts are read-only and clinic-bound; malformed ids are "not found".
- A mute on the number OR the email stops texts. Mute reasons like deceased and moved are about the person, and a stop click is read as "stop". Cost: someone who stops marketing email also loses SMS reminders. Errs toward fewer texts.
- Consent: newest row wins, an opt-out wins a tie. Rows left by an erased contact (matched on the same number or email) can only take consent away: opt-outs carry over, opt-ins never do. Sent to compliance-guard for a check of the DPA erasure posture.
- Last visit for the 7-day marketing rule = any visit by any of the contact's assets (inactive ones too) or any completed appointment, on the Manila calendar. Not for recall: recall uses the last visit per service category.
- Every logged send counts toward caps and same-day rules, failed ones too (a failed status doesn't prove the text never arrived).
- A campaign is approved for sending only while live, or once a scheduled one's time has come. Approvals loaded from the database never carry a stale-sync acknowledgement.
- Clinics whose time zone is not Asia/Manila are refused: the gate's time math is Manila-only. Handled by the Philippines market pack milestone later.
- Reviewer pass 4 fixes: timestamps read as epoch milliseconds and unreadable ones throw (no NaN can pass a check); migration 002 refuses infinite times, bounds the staleness threshold to 1-72 hours (a clinic can tighten the pause, never switch it off), and fixes the format of consent snapshots; a tie between a good and a failed sync reads as failed.
- DEFERRED to the send pipeline milestone (Phase 3): lock the contact and re-check caps in the same transaction as the send; a maximum lateness for scheduled campaigns; a stop click also appends a linked opt-out; one combined loader so clinic and contact can't be mixed. Wiring 2 must never write consent rows from an import.

