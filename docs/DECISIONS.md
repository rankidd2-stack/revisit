# Decision log

Newest first. Locked decisions live in CLAUDE.md; this log records every decision and who made it.

| Date | Decision | By | Reversible? |
| --- | --- | --- | --- |
| 2026-10-30 | Allowlist scope: "cleaning", "check-up" and "consultation" allowed in default texts for all human clinics (dental, aesthetic, other). English words only; linis and konsulta are not on it. Texts about dependents stay strict until the legal consult | Patrick | Yes |
| 2026-10-30 | Runs may fix and finish any parked claude/ branch, and merge into main whenever docs/AUTOPILOT.md step 7 allows | Patrick | Yes |
| 2026-10-30 | Code lives in private GitHub repo rankidd2-stack/revisit (Patrick's account) | Patrick | Yes |
| 2026-10-30 | "Cleaning", "check-up" and "consultation" allowed in default patient texts, including when they are a clinic's own service category names (explicit English allowlist). Default treatment list unchanged | Patrick | Yes |
| 2026-10-30 | Which qualifiers may sit before an allowed word (dental, teeth, tooth, general, routine, regular, annual) is Claude's reading of Patrick's allowlist decision, not Patrick's own list | Claude | Yes |
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

## 2026-10-30 -- Routine visit words allowed (Patrick)
- Patrick: "cleaning" and "check-up" are allowed in default patient texts. "Consultation" added to the same allowlist on Patrick's instruction.
- Built as an explicit allowlist in src/domain/sms.ts (`ALLOWED_VISIT_WORDS`, `isAllowedVisitTerm`). A clinic service category whose name is only one of these words, optionally after a generic qualifier (dental, teeth, tooth, general, routine, regular, annual), no longer blocks a default text. Plurals and "checkup" / "check up" spellings are covered.
- Still blocked: categories with anything more ("Cleaning and whitening", "Deep cleaning", "Ortho consultation", "Implant check-up"), and every word on the default treatment list, even in the same text as an allowed word.
- Not for texts about a dependent: those stay fully strict until the DPA s.13 legal check (corrected after compliance-guard; an earlier draft of this entry applied it to dependents, which Patrick never decided).
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

## 2026-10-30 -- Reviewer pass 5 and compliance pass 3
- FIXED (blocker R40): the allowlist removed the old catch on categories like "Deep cleaning". The treatment matcher now reads text with hyphens, dashes, line breaks and repeated spaces as one space, drops invisible characters, and treats check-up/checkup/check up as one word. A category built on a routine word also blocks its other words alone ("HIV consultation" blocks "HIV"), except plain words like "and" or "visit".
- FIXED (G13): texts about a dependent get no allowlist; a "Dental check-up" category blocks the bare word "check-up" in them.
- FIXED: an opt-out row must carry a number or email snapshot; emails are stored trimmed in contacts, mutes and snapshots; sync ties read as failed in syncHealth itself; schema tests load every migration.
- R36 re-graded to should-fix and made a condition for the send pipeline milestone. Disagreed with one part: the reviewer said sends has no unique event key; it does (`unique (clinic_id, contact_id, event_key)` in 001).
- OPEN for Patrick: allowlist scope (aesthetic and other clinics; Filipino words like linis; dependents after the legal check).
- OPEN, Phase 4 (G9): privacy notice, DPA template and erasure reply must say an erased person's opt-out is kept as a minimal do-not-contact record, with a retention period. Folded into the pending legal consult.
- OPEN, Wiring 2 (G11): imports never write consent rows; test that an import after erasure and opt-out leaves marketing off.

## 2026-10-30 -- Reviewer pass 6 (round 3): parked
- Reviewer round 3 on branch claude/eager-turing-bwpp43: FAIL. Three review rounds used, so per docs/AUTOPILOT.md the branch is parked (pull request plus a needsPatrick entry), not merged. "Database wiring 1" stays in progress.
- OPEN (blocker R47): category words under 3 letters are dropped, so a category like "TB check-up", "OB consultation" or "ED check-up" lets "TB", "OB" or "ED" reach patients. Fix: keep short words and match category words as whole words.
- OPEN (should-fix): R48 extra category words match as prefixes and over-block (a doctor's name can block a patient's first name); R49 a hyphen inside a sensitive word ("pre-natal" vs "Prenatal") still splits it; R50 dependent strictness relies on the caller passing the subject (default is self); R51 multi-word categories without a routine word ("HIV test") match only as the exact phrase (older than the allowlist); R52 a category starting with punctuation never matches.
- OPEN (nits R53-R57): some invisible characters not stripped; word split cuts non-ASCII letters; a category made only of routine words joined by "and" blocks its own text; block message names the word, not the category; migration 002 checks could fail on an existing database with untrimmed emails (add NOT VALID, then validate).
- compliance-guard pass 3 (round 2 diff): pass with risks G9, G11, G12 open. It has not seen the round 3 changes; run it again after the R47 fix.
- Tests on the branch: 159 passing, 0 failing; typecheck clean.
- Next run: finish this branch first (fix R47, R48-R52, reviewer and compliance-guard again), then merge. The allowlist scope question (G12, R46) stays with Patrick.

## 2026-10-30 -- Patrick's answers, integration run
- Allowlist scope (closes R46 and G12): all human clinics; English words only, so a clinic category named "Linis" or "Konsulta" still blocks; texts about a dependent stay strict. The code already applied the allowlist to every human clinic; tests now pin all three points.
- Parked branches: fix and finish them. Merging into main follows AUTOPILOT step 7.
- R50 (Claude): "about a dependent" is now fail-closed. `prepareSms` requires a subject, and only self, pet and package get the relaxed rules; "other" (another person), a missing value or anything unknown is strict. `checkContent` keeps the allowlist off unless the caller turns it on.
- R57 (Claude): migration 002 trims existing emails before adding its checks, and adds the consent ledger checks as NOT VALID, because the ledger is append-only and old rows can't be corrected.
- Known gap, accepted (Claude): a clinic word typed with a plain space inside it ("pre natal" for a "Prenatal" category) is not caught. Hyphens, dots, invisible characters and run-together words are. Catching split words would mean matching every pair of adjacent words, which over-blocks ordinary text.

## 2026-10-30 -- Reviewer round 4 (fail) and compliance pass 4 (pass with risks): fixes
- R58 (blocker): clinic words of 4 letters or more match from a word start again, so a "Psych" category blocks "psychiatry". Words of 2-3 letters ("TB", "STI") stay whole-word plus plural, so "STI" still never blocks "still". Same rule for the default list.
- R59, R60: numbers, time units ("30 min", "6-month") and a name after Dr/Dra/Doc never block alone. R62: Hangul fillers and the braille blank are stripped.
- G14 (Claude, defaults): the allowlist made "STD check-up" pass when the clinic's category was just "Check-up". The default human list now also holds sexual, reproductive and mental health stems and a few other sensitive conditions (hiv, std, pregnan, prenatal, pap smear, ob-gyn, psych, onco, cancer, dialysis and others). Stricter only. To confirm at the pending legal consult.
- G15 (Claude): "package" subjects are strict; assets carry no owner, so a package may be a child's.
- DEFERRED to Wiring 2 (G16): the loader should work out the subject from assets.kind of the event's asset, instead of trusting the caller.
- R61: accepted limit, now pinned by a test (see the earlier note on words split by a plain space).
