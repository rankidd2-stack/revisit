# Decision log

Newest first. Locked decisions live in CLAUDE.md; this log records every decision and who made it.

| Date | Decision | By | Reversible? |
| --- | --- | --- | --- |
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
