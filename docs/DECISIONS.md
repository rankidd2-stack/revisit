# Decision log

Newest first. Locked decisions live in CLAUDE.md; this log records every decision and who made it.

| Date | Decision | By | Reversible? |
| --- | --- | --- | --- |
| 2026-10-30 | Allowlist scope: "cleaning", "check-up" and "consultation" allowed in default texts for all human clinics (dental, aesthetic, other). English words only; linis and konsulta are not on it. Texts about dependents stay strict until the legal consult | Patrick | Yes |
| 2026-10-30 | Runs may fix and finish any parked claude/ branch, and merge into main whenever docs/AUTOPILOT.md step 7 allows | Patrick | Yes |
| 2026-10-30 | Code lives in private GitHub repo rankidd2-stack/revisit (Patrick's account) | Patrick | Yes |
| 2026-10-30 | "Cleaning", "check-up" and "consultation" allowed in default patient texts, including when they are a clinic's own service category names (explicit English allowlist). Default treatment list unchanged | Patrick | Yes |
| 2026-10-30 | Which qualifiers may sit before an allowed word (dental, teeth, tooth, general, routine, regular, annual) is Claude's reading of Patrick's allowlist decision, not Patrick's own list | Claude | Yes |
| 2026-10-30 | Database wiring split into four milestones; sync apply done (reviewer round 2 pass, compliance-guard round 2 pass); empty file or failed fetch = failed sync run; sync never changes clinic-owned status or names; migration 003 (renumbered from 002 at integration) unique visit per asset, service and day; branch not merged to main | Claude | Yes |
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

## 2026-10-30 -- Sync apply (reviewer round 2: pass; compliance-guard round 2: pass; 136 tests)
- Milestone "Database wiring and Google Sheet sync" split into (a) sync apply, run log and Sheet CSV fetch with an injected fetcher (DONE), (b) real Google Sheet fetcher, (c) scheduled sync runner, (d) Philippines market pack split. (b), (c), (d) are todo.
- An empty file or a failed fetch is recorded as a failed sync run, so automated sends pause and the clinic is alerted (locked decision 10).
- Sync never changes clinic-owned status or names. Clinics own patient status.
- New migration 003 (numbered 002 on the branch; renumbered at integration because Database wiring 1 also used 002): one visit per asset, service and day (unique).
- DEFERRED to (b): https-only, redirects limited to docs.google.com and *.googleusercontent.com, timeout, streamed byte cap, content-type check.
- DEFERRED to (c): scheduled runner, optional realtime, stale unfinished runs treated as failed, clinic alert, advisory lock.
- DEFERRED to (d): Philippines market pack split (+63 numbers, Asia/Manila, Semaphore, DTI/DPA word lists).
- Reviewer round 2 suggestions 1-4 fixed in code. Suggestion 6 was mistaken: contacts already have unique mobile and email indexes, so nothing changed.
- The branch was NOT merged to main because this session is restricted to branch claude/charming-pascal-tycjpp. Merge is still to do.

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

## 2026-10-30 -- Reviewer round 5 (fail) and compliance round 2 (pass with G18): fixes
- R64 (blocker): the "name after Dr/Dra never blocks" rule let clinical words through. Removed. Lesson: exceptions in the matcher open holes; prefer judging less text over adding exceptions.
- R60, R66, R67 (Claude, code structure): treatment words are now judged on the approved template with name placeholders (first_name, last_name, full_name, pet_name, clinic, clinic_name) masked. A patient called Stephanie, a doctor's name in a category, or a clinic called "Psych Wellness Center" no longer blocks a text; the clinic's sender name already shows its name. Discount, claim, shortener and TEST checks still read the real text. A doctor's name written into the template itself still blocks (fails closed).
- R65 (Claude, reading of Patrick's allowlist): "consult", "check" and "clean" are the same three words as clinics write them, so they count as routine words.
- R68: ordinals ("2nd") never block alone.
- G18 (Claude, defaults): default human list extended with TB, OB, HPV, PCOS, ADHD (whole words) and infertility, STIs, reproductive, mental health, kidney, heart, cancer screening and other stems. Stricter only. Consequence: a human clinic's marketing text like "Free diabetes talk" is blocked unless the clinic opted in to naming treatments, which is locked decision 9 working as intended.
- G19: "aids" matches whole words only; "hearing aids" still blocks. Accepted: it fails closed and the clinic sees why.
- Compliance note for the legal consult: the word list can never be complete. The lasting safeguard is the clinic's own service list, filled in at onboarding; the console makes that a required setup step.

## 2026-10-30 -- Reviewer round 6 (third round this run): FAIL, branch parked
- R70 (blocker, introduced by the round 5 fix): masking name placeholders means names are never checked. `importCsv` keeps full names as typed, so "Ana Cruz (braces)" or "Ana Cruz HIV" reaches the lock screen. Before a52a822 these were blocked.
- compliance-guard round 3: PASS with risks G20 ({clinic} supplied by the caller is masked) and G21 (pet or dependent labels are masked and never checked).
- Fix for the next run, one change covers R70, R71, R72, G20 and G21:
  1. Keep `treatmentText` inside the pipeline (not a public checkContent option), or have checkContent take the name values itself.
  2. Name values (first_name, pet_name, clinic and the rest) are checked against the default sensitive list and whole words, but not against the clinic's own category words. "Stephanie" passes, "Ana Cruz (braces)" and "Manila HIV and Rehab Center" block.
  3. Strip bracketed notes and text after " - " from full names on import, as asset labels already are.
  4. R73: make cardi, breast and therap whole-word or more specific ("cardiolog", "breast exam", "therapy session"?), and spare "Cardinal" and "Tuliahan". R74 comment fix. R75 tests for all of the above.
- Round count: rounds 4, 5 and 6 ran in this run, so per AUTOPILOT step 5 the branch is parked and the run ends. claude/charming-pascal-tycjpp is not merged this run, though it is ready (migration renumbered to 003, 136 tests on its own).
| 2026-10-30 | Code lives in private GitHub repo rankidd2-stack/revisit (Patrick's account) | Patrick | Yes |


## 2026-10-31 -- Direction for the parked branch (Claude, code structure; overrides the round-6 fix plan)
Six reviewer rounds on `claude/eager-turing-bwpp43` (R47 to R75) all came from one design: judging free text
for health words while making exceptions so names don't trip it. Each exception opened a hole. Stop patching
the matcher; take free text out of patient texts instead.
1. Templates may use only these variables: `{first_name}`, `{pet_name}`, `{clinic}`. Remove `{last_name}` and
   `{full_name}` from the template language; a template using any other placeholder is refused at approval.
2. `first_name` is derived, never typed into a text: take the contact's name, drop bracketed text and anything
   after " - ", take the first word, keep letters (any script), apostrophes and hyphens, cap 20 characters,
   title-case it. "Ana Cruz (braces)" and "Ana Cruz HIV" both render "Ana". Empty result: the send is refused
   (missing_variable). `pet_name` gets the same cleaning from the asset label.
3. `{clinic}` is the clinic's display name, approved once at onboarding. It is checked against the default
   sensitive list when a person sets or changes it; a hit needs explicit clinic confirmation (stored with who
   and when). It is not re-judged on every send.
4. The treatment check then judges the whole approved template text with the variables masked, against
   the default list and the clinic's own categories, plus the cleaned variable values against the default list
   only (whole words). Names can no longer carry notes, so R60, R66, R67, R70, R71, G20 and G21 close by design.
5. Freeze the default sensitive list at what is on the branch now. Over-blocking of ordinary words (R73) is
   handled by making those stems more specific; new additions wait for the legal consult. The list is a safety
   net; the real safeguards are the approved template and the cleaned variables.
6. Merge `claude/charming-pascal-tycjpp` first (it is ready), then finish this branch on the new design.

## 2026-10-31 -- Sync apply merged to main (scheduled run; reviewer: pass; compliance-guard: pass; 140 tests)
- Integrated `claude/charming-pascal-tycjpp` onto main ahead of the parked branch, as the direction above says.
- Migration numbering: main now has 001 and 003. The parked branch's 002 merges later and runs before 003 in tests (sorted load); 002 does not touch visits, so order is safe. Any future migration runner must record each applied file name, not only the highest number (R76).
- Fixed from this round: patient IDs are kept only when they look like a code (ID characters and at least one digit), so "HIV+" or "allergic-penicillin" is dropped (R81, compliance risk 1); a mute that blocks an insert has its own counter (R79); four missing tests added (R82).
- Deferred to the scheduled runner milestone: log counts only, never SyncOutcome.result (G23); flag a sync with a high rejection rate (G24); batch lookups (R80).
- Deferred, by design for now: an email-only row matched to a contact whose mobile is muted still adds a visit (R77; the send gate blocks every send to a muted number); a contact matched by email does not get the row's mobile filled in (R78; filling a mobile from a sheet could attach a stranger's number, so the clinic adds it by hand).
- Recall loader must skip inactive assets (G25); noted for Database wiring 1.

- PM check (2026-10-31): "Database wiring 1" added to main's STATUS.json as in_progress (it lives on `claude/eager-turing-bwpp43`). The needsPatrick item on cleaning/linis/check-up wording is removed: Patrick answered it on 2026-10-30 (cleaning, check-up and consultation allowed, English only, linis not), logged on that branch; the full entry reaches main when the branch merges. Finding IDs R32, R33 and G9 to G11 mean different things on main and on that branch; renumber the branch's copies at merge (findings.csv stays append-only).

## 2026-10-31 -- Database wiring 1 reworked on the new design (scheduled run)
Built the "Direction for the parked branch" entry instead of patching the matcher again:
- Template language is `{first_name}`, `{pet_name}`, `{clinic}` only. Any other brace refuses the template (`templateProblems`, pipeline reason `bad_template`). Migration 004 enforces the same on approved recall rules and campaigns (NOT VALID, so old rows are untouched; drafts may hold anything).
- The pipeline no longer takes variable values. It takes the raw contact name and asset label and derives the names itself (`cleanFirstName`): notes in brackets (closed or not) and after " - " are dropped, then the leading run of letters, apostrophes and hyphens of the first word, 20 characters, title-cased. "Ana Cruz (braces)", "Ana Cruz HIV" and "Ana+HIV" all give "Ana". One deviation from the direction text, Claude's call: the leading run is kept rather than every letter of the word, so "Ana+HIV" can't become "Anahiv".
- `{clinic}` is `clinics.name`. A name that hits the default sensitive list needs `display_name_confirmed_by` and `_at` (migration 004); renaming the clinic clears the confirmation, so a rename and a confirmation must be two separate saves. The pipeline refuses a template using `{clinic}` while a sensitive name is unconfirmed (`clinic_name_unconfirmed`). Names without a hit need nothing.
- Treatment check: the approved template with variables masked, against the default list and the clinic's categories; plus each cleaned name against the default list, whole words only. Every other check (promo, claims, shorteners) runs on the text as sent. The `treatmentText` option is gone from `checkContent`, so no caller can switch the check off (R72).
- Default list frozen except for R73: "cardi" became cardiac, cardiolog, cardiovasc; "therap" became physiotherap plus whole words therapy and therapies; "tuli" and "breast" match whole words only, with "patuli" added as a Filipino root.
- Closes by design: R60, R66, R67, R70, R71, R72, R73, R74, R75, G20, G21.
- Integration: findings R29 to R33 and G9 to G11 on this branch clashed with main's ids; the branch's rows are now R83 to R87 and G26 to G28 (main's keep theirs). Migrations are 001, 002 (this branch), 003 (sync apply, already on main), 004 (this rework).
- Round 2 (reviewer FAIL, compliance-guard FAIL, same blocker): a hyphen or apostrophe inside the first word hid a health word ("Lola-dialysis"). Fixed by judging each part as its own word. Names now also catch 6+ letter stems from a word start ("Diabetic") and a short list of word forms (pregnant, psychiatric, autistic...), names-only; short stems stay whole-word so "Renalyn" passes. Mixed-script names are refused (look-alike letters). The clinic name is no longer cut at 40 characters.
- A clinic name that hits the sensitive list never goes into a text about a dependent, package or unknown subject, confirmed or not (compliance-guard). Whether a confirmed sensitive clinic name may appear in any text is a legal-posture question; it is added to the legal-consult item in needsPatrick. Until then the confirmation lets it through for texts about the patient or their pet only, since the registered sender name shows the clinic anyway.
- Migration 004: a new clinic always starts unconfirmed (insert clears it), so confirming is its own save.
- Round 3 (reviewer PASS, compliance-guard PASS; 218 tests): names now match 4+ letter stems from a word start ("Oncologist", "Psychology"), except renal, crown, brace, pasta and bunot, which start real first names (Renalyn, Crownie, Bracelyn). About 100 real English and Filipino first names were probed with no false block; an invented name that starts with a stem fails safe (send refused, clinic sees why). A confirmed sensitive clinic name refused for a dependent text has its own reason, `clinic_name_about_dependent`. Words not on the frozen list (lasik, thyroid, stroke) still pass in names: known limit, listed for the legal consult.
- Database wiring 1 merged to main. Still required before any real send (Database wiring 2): derive the subject from `assets.kind` and skip inactive assets in the recall loader (G33).


## 2026-11-01 -- Demo console before Phase 1 finishes (Patrick)
- Patrick (live session, "we're just getting to the demo right? Then what's stopping you?"): build the clickable demo console now. This run skips AUTOPILOT step 2 for the parked `claude/upbeat-turing-5echdr` (Database wiring 2); the next run picks it up as usual. The demo does not depend on it: it runs on sample data and the rules already on main.
- Phase 1 milestones still to do (Wiring 2, real Sheet fetcher, scheduled runner, PH market pack) stay required before any real send. The demo sends nothing.

## 2026-11-01 -- Clickable console: daily autopilot queue (Claude)
- Stack: Vite + React in `console/`, not Next.js as first planned. The demo is static (no server, no keys), so it builds to plain files that open anywhere; Next.js comes back when Phase 3 needs a server. `npm run console` runs it, `npm run console:build` builds it.
- The console imports the real domain code: `proposeDailyQueue` (src/send/queue.ts) runs every recall step due today through `prepareSms`, so every previewed text is the exact approved wording with the reply path and stop link, and every held text shows the real reason in plain words.
- One recall text per person per day in the queue: a second pet or child shows as "Tomorrow" (the gate already enforced this for past sends; the queue now applies it within the day).
- Money number: `recoveredInMonth` (src/domain/roi.ts) counts bookings this month that followed a text to the same person within 30 days, once each, on the Manila calendar. Demo history is invented.
- Demo clock: today's date at 10:00 AM Manila, so the queue is never empty because someone opened it at night. Demo controls switch dental and vet, a stale patient list, and 9 PM (quiet hours). "Approve" only marks texts as approved; nothing is sent.
- Sample wording fits 1 SMS (a test checks it), because cost per text is the first thing an owner asks.
- UI uses only design/tokens.css and the five components in design/README.md, built in console/src/components (the README's components bundle is not in the repo).
- Review round 1 (reviewer PASS, compliance-guard PASS): fixed R200-R202, R204-R210 and G200-G203, G205. The daily slot is per mobile, goes to the step that has waited longest, and counts texts deferred by quiet hours; a deferred text is re-checked at its send time. The money number counts only recall and marketing texts and carries a "Sample numbers" label in the demo. Sample mobiles use the unassigned 0900 prefix.
- DEFERRED: R203 (key sent steps by cycle, send pipeline milestone), G204 ({pet_name} for a child), G206 (Smart and our stop-link domain), G207 (does an approved automation need the daily click? decide before live sends; the demo shows the click).
- Review round 2: reviewer PASS, compliance-guard PASS. Deferred nits R211-R214 and notes G208-G210 (see status/findings.csv). Milestone done and merged.

## 2026-11-01 -- Demo link and next step
- The built console is published as a private claude.ai artifact ("Revisit Demo Console") for Patrick to open on his phone and show clinics. It holds only the static build; nothing sends.
- Merged branch `claude/console-daily-queue` could not be deleted from origin from this session (the remote hung up on delete; pushing main worked). It is fully merged, so step 2 of the next run ignores it; delete it when possible.
- OPEN for Patrick (needsPatrick): real AI (paid API account) or labelled sample drafts for the next two demo milestones. Recommended: sample drafts first.
